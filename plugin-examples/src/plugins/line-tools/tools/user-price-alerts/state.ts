import { Delegate } from '../../../../helpers/delegate';
import { LineTool, AlertCondition } from '../line-tool-alert-manager';

export interface UserAlertInfo {
	id: string;
	price: number;
	condition?: AlertCondition;
	type?: 'price' | 'tool';
	toolRef?: LineTool;
}

export class UserAlertsState {
	protected _alertAdded: Delegate<UserAlertInfo> = new Delegate();
	protected _alertRemoved: Delegate<string> = new Delegate();
	protected _alertChanged: Delegate<UserAlertInfo> = new Delegate();
	protected _alertsChanged: Delegate = new Delegate();
	protected _alerts: Map<string, UserAlertInfo>;

	constructor() {
		this._alerts = new Map();
		this._alertsChanged.subscribe(() => {
			this._updateAlertsArray();
		}, this);
	}

	destroy() {
		// TODO: add more destroying 💥
		this._alertsChanged.unsubscribeAll(this);
	}

	alertAdded(): Delegate<UserAlertInfo> {
		return this._alertAdded;
	}

	alertRemoved(): Delegate<string> {
		return this._alertRemoved;
	}

	alertChanged(): Delegate<UserAlertInfo> {
		return this._alertChanged;
	}

	alertsChanged(): Delegate {
		return this._alertsChanged;
	}

	addAlert(price: number): string {
		return this.addAlertWithCondition(price, 'crossing');
	}

	addAlertWithCondition(price: number, condition: AlertCondition): string {
		const id = this._getNewId();
		const userAlert: UserAlertInfo = {
			price,
			id,
			condition,
		};
		this._alerts.set(id, userAlert);
		this._alertAdded.fire(userAlert);
		this._alertsChanged.fire();
		return id;
	}

	removeAlert(id: string) {
		if (!this._alerts.has(id)) return;
		this._alerts.delete(id);
		this._alertRemoved.fire(id);
		this._alertsChanged.fire();
	}

	updateAlertPrice(id: string, newPrice: number) {
		const alert = this._alerts.get(id);
		if (!alert) return;
		alert.price = newPrice;
		this._alertChanged.fire(alert);
		this._alertsChanged.fire();
	}

	updateAlert(id: string, newPrice: number, condition: AlertCondition) {
		const alert = this._alerts.get(id);
		if (!alert) return;
		alert.price = newPrice;
		alert.condition = condition;
		this._alertChanged.fire(alert);
		this._alertsChanged.fire();
	}

	alerts() {
		return this._alertsArray;
	}

	_alertsArray: UserAlertInfo[] = [];
	_updateAlertsArray() {
		this._alertsArray = Array.from(this._alerts.values()).sort((a, b) => {
			return b.price - a.price;
		});
	}

	protected _getNewId(): string {
		let id = Math.round(Math.random() * 1000000).toString(16);
		while (this._alerts.has(id)) {
			id = Math.round(Math.random() * 1000000).toString(16);
		}
		return id;
	}
}
