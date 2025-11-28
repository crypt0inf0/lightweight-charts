import {
	IChartApi,
	ISeriesApi,
	ISeriesPrimitive,
	IPrimitivePaneView,
	PrimitiveHoveredItem,
	SeriesAttachedParameter,
	SeriesType,
	Time,
} from 'lightweight-charts';
import {
	averageWidthPerCharacter,
	buttonWidth,
	centreLabelHeight,
	centreLabelInlinePadding,
	clockIconPaths,
	clockPlusIconPaths,
	removeButtonWidth,
	showCentreLabelDistance,
} from './constants';
import { AlertRendererData, IRendererData } from './irenderer-data';
import { MouseHandlers, MousePosition } from './mouse';
import { UserAlertPricePaneView } from './pane-view';
import { UserAlertInfo, UserAlertsState } from './state';
import { AlertEditDialog } from './alert-edit-dialog';
import { Delegate } from '../../../../helpers/delegate';

export interface AlertCrossing {
	alertId: string;
	alertPrice: number;
	crossingPrice: number;
	direction: 'up' | 'down';
	condition: 'crossing' | 'crossing_up' | 'crossing_down';
	timestamp: number;
}

export class UserPriceAlerts
	extends UserAlertsState
	implements ISeriesPrimitive<Time> {
	private _chart: IChartApi | undefined = undefined;
	private _series: ISeriesApi<SeriesType> | undefined = undefined;
	private _mouseHandlers: MouseHandlers;

	private _paneViews: UserAlertPricePaneView[] = [];
	private _pricePaneViews: UserAlertPricePaneView[] = [];

	private _lastMouseUpdate: MousePosition | null = null;
	private _currentCursor: string | null = null;

	private _symbolName: string = '';
	private _dragState: { alertId: string; startY: number } | null = null;
	private _lastPrice: number | null = null;
	private _onAlertTriggered: Delegate<AlertCrossing> = new Delegate();
	private _editDialog: AlertEditDialog;

	constructor() {
		super();
		this._mouseHandlers = new MouseHandlers();
		this._editDialog = new AlertEditDialog();
	}

	attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
		this._chart = chart;
		this._series = series;
		this._paneViews = [new UserAlertPricePaneView(false)];
		this._pricePaneViews = [new UserAlertPricePaneView(true)];
		this._mouseHandlers.attached(chart, series);
		this._mouseHandlers.mouseMoved().subscribe(mouseUpdate => {
			this._lastMouseUpdate = mouseUpdate;
			requestUpdate();
		}, this);
		this._mouseHandlers.clicked().subscribe(mousePosition => {
			if (mousePosition && this._series) {
				if (this._isHovering(mousePosition)) {
					const price = this._series.coordinateToPrice(mousePosition.y);
					if (price) {
						this.addAlert(price);
						requestUpdate();
					}
				}
				if (this._hoveringID) {
					this.removeAlert(this._hoveringID);
					requestUpdate();
					return;
				}

				// Check if clicking on an alert label to edit
				const editAlertId = this._getHoveringAlertId(mousePosition, false);
				if (editAlertId) {
					this.openEditDialog(editAlertId);
				}
			}
		}, this);
		this._mouseHandlers.mouseDown().subscribe(mousePosition => {
			if (mousePosition && this._series) {
				// Check if clicking on an alert label (not remove button)
				const hoveringAlertId = this._getHoveringAlertId(mousePosition, false);
				if (hoveringAlertId) {
					this._dragState = { alertId: hoveringAlertId, startY: mousePosition.y };
				}
			}
		}, this);
		this._mouseHandlers.mouseUp().subscribe(() => {
			this._dragState = null;
		}, this);
		this._mouseHandlers.mouseMoved().subscribe(mousePosition => {
			// Handle dragging
			if (this._dragState && mousePosition && this._series) {
				const newPrice = this._series.coordinateToPrice(mousePosition.y);
				if (newPrice !== null) {
					this.updateAlertPrice(this._dragState.alertId, newPrice);
					requestUpdate();
				}
			}
		}, this);
	}

	detached() {
		this._mouseHandlers.mouseMoved().unsubscribeAll(this);
		this._mouseHandlers.clicked().unsubscribeAll(this);
		this._mouseHandlers.mouseDown().unsubscribeAll(this);
		this._mouseHandlers.mouseUp().unsubscribeAll(this);
		this._mouseHandlers.detached();
		this._series = undefined;
	}

	paneViews(): readonly IPrimitivePaneView[] {
		return this._paneViews;
	}

	priceAxisPaneViews(): readonly IPrimitivePaneView[] {
		return this._pricePaneViews;
	}

	updateAllViews(): void {
		// Check for price crossings using the crosshair price or mouse position
		if (this._lastMouseUpdate && this._series) {
			const currentPrice = this._series.coordinateToPrice(this._lastMouseUpdate.y);
			if (currentPrice !== null) {
				this.checkPriceCrossings(currentPrice);
			}
		}

		const alerts = this.alerts();
		const rendererData = this._calculateRendererData(
			alerts,
			this._lastMouseUpdate
		);
		this._currentCursor = null;
		if (
			rendererData?.button?.hovering ||
			rendererData?.alerts.some(alert => alert.showHover && alert.hoverRemove)
		) {
			this._currentCursor = 'pointer';
		}
		this._paneViews.forEach(pv => pv.update(rendererData));
		this._pricePaneViews.forEach(pv => pv.update(rendererData));
	}

	hitTest(): PrimitiveHoveredItem | null {
		if (!this._currentCursor) return null;
		return {
			cursorStyle: this._currentCursor,
			externalId: 'user-alerts-primitive',
			zOrder: 'top',
		};
	}

	setSymbolName(name: string) {
		this._symbolName = name;
	}

	public openEditDialog(alertId: string, initialData?: { price: number, condition: 'crossing' | 'crossing_up' | 'crossing_down' }) {
		const alert = this.alerts().find(a => a.id === alertId);

		const data = alert ? {
			alertId: alert.id,
			price: alert.price,
			condition: alert.condition || 'crossing',
			symbol: this._symbolName
		} : (initialData ? {
			alertId: alertId,
			price: initialData.price,
			condition: initialData.condition,
			symbol: this._symbolName
		} : null);

		if (!data) return;

		this._editDialog.show(data, (result) => {
			if (alert) {
				this.updateAlert(result.alertId, result.price, result.condition);
			} else {
				// Alert was deleted (one-shot), create a new one
				this.addAlertWithCondition(result.price, result.condition);
			}
		});
	}

	public alertTriggered(): Delegate<AlertCrossing> {
		return this._onAlertTriggered;
	}

	/**
	 * Check current price against all alerts for crossings
	 * Call this method when price updates occur
	 */
	public checkPriceCrossings(currentPrice: number): void {
		if (this._lastPrice === null) {
			this._lastPrice = currentPrice;
			return;
		}

		const alerts = this.alerts();
		const triggeredAlertIds: string[] = [];

		for (const alert of alerts) {
			// Check if price crossed from below to above, or above to below
			const crossedUp = this._lastPrice < alert.price && currentPrice >= alert.price;
			const crossedDown = this._lastPrice > alert.price && currentPrice <= alert.price;

			let triggered = false;
			const condition = alert.condition || 'crossing';

			if (condition === 'crossing') {
				triggered = crossedUp || crossedDown;
			} else if (condition === 'crossing_up') {
				triggered = crossedUp;
			} else if (condition === 'crossing_down') {
				triggered = crossedDown;
			}

			if (triggered) {
				const crossing: AlertCrossing = {
					alertId: alert.id,
					alertPrice: alert.price,
					crossingPrice: currentPrice,
					direction: crossedUp ? 'up' : 'down',
					condition: alert.condition || 'crossing',
					timestamp: Date.now()
				};
				this._onAlertTriggered.fire(crossing);
				triggeredAlertIds.push(alert.id);
			}
		}

		// Remove triggered alerts (one-shot)
		triggeredAlertIds.forEach(id => this.removeAlert(id));

		this._lastPrice = currentPrice;
	}

	_isHovering(mousePosition: MousePosition | null): boolean {
		return Boolean(
			mousePosition &&
			mousePosition.xPositionRelativeToPriceScale >= 1 &&
			mousePosition.xPositionRelativeToPriceScale < buttonWidth
		);
	}

	_isHoveringRemoveButton(
		mousePosition: MousePosition | null,
		timescaleWidth: number,
		alertY: number,
		textLength: number
	): boolean {
		if (!mousePosition || !timescaleWidth) return false;
		const distanceY = Math.abs(mousePosition.y - alertY);
		if (distanceY > centreLabelHeight / 2) return false;
		const labelWidth =
			centreLabelInlinePadding * 2 +
			removeButtonWidth +
			textLength * averageWidthPerCharacter;
		const buttonCentreX =
			(timescaleWidth + labelWidth - removeButtonWidth) * 0.5;
		const distanceX = Math.abs(mousePosition.x - buttonCentreX);
		return distanceX <= removeButtonWidth / 2;
	}

	private _hoveringID: string = '';

	/**
	 * We are calculating this here instead of within a view
	 * because the data is identical for both Renderers so lets
	 * rather calculate it once here.
	 */
	_calculateRendererData(
		alertsInfo: UserAlertInfo[],
		mousePosition: MousePosition | null
	): IRendererData | null {
		if (!this._series) return null;
		const priceFormatter = this._series.priceFormatter();

		const showCrosshair = mousePosition && !mousePosition.overTimeScale;
		const showButton = showCrosshair;
		const crosshairPrice =
			mousePosition && this._series.coordinateToPrice(mousePosition.y);
		const crosshairPriceText = priceFormatter.format(crosshairPrice ?? -100);

		let closestDistance = Infinity;
		let closestIndex: number = -1;

		const alerts: (AlertRendererData & { price: number; id: string })[] =
			alertsInfo.map((alertInfo, index) => {
				const y = this._series!.priceToCoordinate(alertInfo.price) ?? -100;
				if (mousePosition?.y && y >= 0) {
					const distance = Math.abs(mousePosition.y - y);
					if (distance < closestDistance) {
						closestIndex = index;
						closestDistance = distance;
					}
				}
				return {
					y,
					showHover: false,
					price: alertInfo.price,
					id: alertInfo.id,
				};
			});
		this._hoveringID = '';
		if (closestIndex >= 0 && closestDistance < showCentreLabelDistance) {
			const timescaleWidth = this._chart?.timeScale().width() ?? 0;
			const a = alerts[closestIndex];
			const text = `${this._symbolName} crossing ${this._series
				.priceFormatter()
				.format(a.price)}`;
			const hoverRemove = this._isHoveringRemoveButton(
				mousePosition,
				timescaleWidth,
				a.y,
				text.length
			);
			alerts[closestIndex] = {
				...alerts[closestIndex],
				showHover: true,
				text,
				hoverRemove,
			};
			if (hoverRemove) this._hoveringID = a.id;
		}
		return {
			alertIcon: clockIconPaths,
			alerts,
			button: showButton
				? {
					hovering: this._isHovering(mousePosition),
					hoverColor: '#50535E',
					crosshairLabelIcon: clockPlusIconPaths,
				}
				: null,
			color: '#131722',
			crosshair: showCrosshair
				? {
					y: mousePosition.y,
					text: crosshairPriceText,
				}
				: null,
		};
	}

	/**
	 * Get the ID of the alert being hovered, optionally checking for remove button
	 */
	_getHoveringAlertId(mousePosition: MousePosition | null, checkRemoveButton: boolean): string | null {
		if (!mousePosition || !this._series || !this._chart) return null;
		const alerts = this.alerts();
		let closestDistance = Infinity;
		let closestIndex = -1;

		for (let i = 0; i < alerts.length; i++) {
			const y = this._series.priceToCoordinate(alerts[i].price) ?? -100;
			if (y >= 0) {
				const distance = Math.abs(mousePosition.y - y);
				if (distance < closestDistance) {
					closestIndex = i;
					closestDistance = distance;
				}
			}
		}

		if (closestIndex >= 0 && closestDistance < showCentreLabelDistance) {
			if (checkRemoveButton) {
				const timescaleWidth = this._chart.timeScale().width();
				const alertInfo = alerts[closestIndex];
				const y = this._series.priceToCoordinate(alertInfo.price) ?? -100;
				const text = `${this._symbolName} crossing ${this._series.priceFormatter().format(alertInfo.price)}`;
				const hoverRemove = this._isHoveringRemoveButton(mousePosition, timescaleWidth, y, text.length);
				if (!hoverRemove) return null; // Not hovering remove button
			}
			return alerts[closestIndex].id;
		}

		return null;
	}
}
