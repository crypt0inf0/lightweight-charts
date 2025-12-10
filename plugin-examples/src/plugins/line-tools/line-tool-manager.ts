
import {
    MouseEventParams,
    SeriesAttachedParameter,
    Time,
    Logical,
} from 'lightweight-charts';
import { PluginBase } from '../plugin-base';

import { TrendLine } from './tools/trend-line';
import { HorizontalLine } from './tools/horizontal-line/horizontal-line';
import { HorizontalRay } from './tools/horizontal-ray';
import { VerticalLine } from './tools/vertical-line';
import { Rectangle } from './tools/rectangle';
import { Text } from './tools/text';
import { ParallelChannel } from './tools/parallel-channel';
import { FibRetracement } from './tools/fib-retracement';
import { Triangle } from './tools/triangle';
import { Polyline, PolylinePresets, LogicalPoint, Path } from './tools/polyline';
import { Callout } from './tools/callout';
import { CrossLine } from './tools/cross-line';
import { Circle } from './tools/circle';
import { PriceRange } from './tools/price-range';
import { LongPosition } from './tools/long-position';
import { ShortPosition } from './tools/short-position';
import { ElliottImpulseWave } from './tools/elliott-impulse-wave';
import { ElliottCorrectionWave } from './tools/elliott-correction-wave';
import { DateRange } from './tools/date-range';
import { FibExtension } from './tools/fib-extension';
import { FloatingToolbar } from './floating-toolbar';
import { SessionHighlighting, SessionHighlighter } from './tools/session-highlighting';
import { UserPriceAlerts } from './tools/user-price-alerts/user-price-alerts';
import { AlertNotification } from './tools/user-price-alerts/alert-notification';
import { ChartControls } from './chart-controls';
import { PriceLabel } from './tools/price-label';
import { DatePriceRange } from './tools/date-price-range';
import { Measure } from './tools/measure';
import { HeadAndShoulders } from './tools/head-and-shoulders';
import { HistoryManager, ToolState, extractToolState, applyToolState } from './history-manager';
import { TextInputDialog } from './text-input-dialog';

export type ToolType = 'TrendLine' | 'HorizontalLine' | 'VerticalLine' | 'Rectangle' | 'Text' | 'ParallelChannel' | 'FibRetracement' | 'Triangle' | 'Brush' | 'Callout' | 'CrossLine' | 'Circle' | 'Highlighter' | 'Path' | 'Arrow' | 'Ray' | 'ExtendedLine' | 'HorizontalRay' | 'PriceRange' | 'LongPosition' | 'ShortPosition' | 'ElliottImpulseWave' | 'ElliottCorrectionWave' | 'DateRange' | 'FibExtension' | 'UserPriceAlerts' | 'Eraser' | 'PriceLabel' | 'DatePriceRange' | 'Measure' | 'HeadAndShoulders' | 'None';

/**
 * State information for an active drag operation
 */
interface DragState {
    tool: any;                    // The tool being dragged
    type: 'anchor' | 'shape';     // What's being dragged
    anchorIndex?: number;         // Which anchor (if type='anchor')
    startPoint: LogicalPoint;     // Where drag started
    offsetLogical?: number;       // Logical offset for shape dragging
    offsetPrice?: number;         // Price offset for shape dragging
}

export class LineToolManager extends PluginBase {
    private _activeToolType: ToolType = 'None';
    private _activeTool: TrendLine | HorizontalLine | VerticalLine | Rectangle | Text | ParallelChannel | FibRetracement | Triangle | Polyline | Callout | CrossLine | Circle | Path | PriceRange | LongPosition | ShortPosition | ElliottImpulseWave | ElliottCorrectionWave | DateRange | FibExtension | HorizontalRay | PriceLabel | DatePriceRange | Measure | HeadAndShoulders | null = null;
    private _points: LogicalPoint[] = [];
    private _tools: any[] = []; // Store all created tools
    private _toolOptions: Map<ToolType, any> = new Map(); // Store default options for each tool type
    private _isDrawing: boolean = false; // Track if currently drawing
    private _lastPixelPoint: { x: number, y: number } | null = null;
    private _isRightClick: boolean = false; // Track right-click to prevent adding points

    // Editing state
    private _selectedTool: any | null = null;        // Currently selected tool
    private _dragState: DragState | null = null;     // Active drag operation
    private _isDragging: boolean = false;             // Is user dragging?

    // Path tool double-click detection
    private _lastClickTime: number = 0;
    private _lastClickPoint: { x: number, y: number } | null = null;

    // Context menu handler reference (ML-8)
    private _contextMenuHandler: ((e: MouseEvent) => void) | null = null;

    private _userPriceAlerts: UserPriceAlerts | null = null;
    private _alertNotifications: AlertNotification | null = null;
    private _toolbar: FloatingToolbar | null = null;
    private _chartControls: ChartControls | null = null;
    private _textInputDialog: TextInputDialog = new TextInputDialog();

    // Undo/Redo history manager
    private _historyManager: HistoryManager = new HistoryManager();
    private _dragPrevState: ToolState | null = null;  // State before drag starts

    // Alert subscription tracking (ML-1)
    private _alertSubscription: any = null;

    // Double-click detection for text editing
    private _lastClickedTool: any = null;
    private _lastToolClickTime: number = 0;

    // Hide all drawings state
    private _drawingsHidden: boolean = false;

    // Lock all drawings state
    private _allDrawingsLocked: boolean = false;

    private _setNoneButtonActive(): void {
        document.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        const noneBtn = document.getElementById('btn-none');
        if (noneBtn) {
            noneBtn.classList.add('active');
        }
    }

    private _cancelActiveDrawing(): void {
        if (this._activeTool) {
            this.series.detachPrimitive(this._activeTool);
            const index = this._tools.indexOf(this._activeTool);
            if (index !== -1) {
                this._tools.splice(index, 1);
            }
            this._activeTool = null;
        }

        this._points = [];
        this._isDrawing = false;
        this._lastPixelPoint = null;

        if (this._activeToolType !== 'None') {
            this._activeToolType = 'None';
            this._setChartInteraction(true);
        }

        this._deselectCurrentTool();
        this._toolbar?.hide();
        this._setNoneButtonActive();
        this._updateCursor();
    }

    private _updateCursor(): void {
        const chartElement = (this.chart as any).chartElement?.();
        if (!chartElement) return;

        if (this._activeToolType === 'Eraser') {
            chartElement.classList.add('eraser-cursor');
        } else {
            chartElement.classList.remove('eraser-cursor');
        }
    }

    private _setChartInteraction(enabled: boolean): void {
        this.chart.applyOptions({
            handleScroll: enabled,
            handleScale: enabled,
        });
    }

    constructor() {
        super();

        // Initialize default options with Blue color
        const defaultColor = '#2962FF';
        const defaultOptions = { lineColor: defaultColor, color: defaultColor, lineWidth: 2 };

        const tools: ToolType[] = [
            'TrendLine', 'HorizontalLine', 'VerticalLine', 'Rectangle', 'Text',
            'ParallelChannel', 'FibRetracement', 'Triangle', 'Brush', 'Callout',
            'CrossLine', 'Circle', 'Highlighter', 'Path', 'Arrow', 'Ray',
            'ExtendedLine', 'HorizontalRay', 'PriceRange', 'LongPosition',
            'ShortPosition', 'ElliottImpulseWave', 'ElliottCorrectionWave',
            'DateRange', 'FibExtension', 'UserPriceAlerts', 'Eraser', 'PriceLabel',
            'DatePriceRange', 'Measure', 'HeadAndShoulders'
        ];

        tools.forEach(type => {
            this._toolOptions.set(type, { ...defaultOptions });
        });
    }

    public attached(param: SeriesAttachedParameter<Time>): void {
        super.attached(param);

        this.chart.subscribeClick(this._clickHandler);
        this.chart.subscribeCrosshairMove(this._moveHandler);

        // Add mouse event listeners for smooth drawing
        const chartElement = (this.chart as any).chartElement?.();
        if (chartElement) {
            chartElement.addEventListener('mousedown', this._mouseDownHandler);
            chartElement.addEventListener('mouseup', this._mouseUpHandler);
            this._contextMenuHandler = (e: MouseEvent) => e.preventDefault();
            chartElement.addEventListener('contextmenu', this._contextMenuHandler);
        }

        // Global mousemove for smooth drawing
        window.addEventListener('mousemove', this._rawMouseMoveHandler);

        // Global keydown for undo/redo and other keyboard shortcuts
        window.addEventListener('keydown', this._keyDownHandler);

        // Initialize UserPriceAlerts and AlertNotification
        this._userPriceAlerts = new UserPriceAlerts();
        this.series.attachPrimitive(this._userPriceAlerts);

        this._alertNotifications = new AlertNotification(this);
        this._alertSubscription = this._userPriceAlerts!.alertTriggered().subscribe((crossing) => {
            this._alertNotifications?.show({
                alertId: crossing.alertId,
                symbol: 'BTCUSD', // TODO: Get actual symbol
                price: this.series.priceFormatter().format(crossing.alertPrice),
                timestamp: crossing.timestamp,
                direction: crossing.direction,
                condition: crossing.condition,
                onEdit: (data) => {
                    this._userPriceAlerts?.openEditDialog(data.alertId, {
                        price: parseFloat(data.price),
                        condition: data.condition
                    });
                }
            });
        }, this);

        this._toolbar = new FloatingToolbar(this);

        // Initialize Chart Controls
        this._chartControls = new ChartControls(this.chart);
        this._chartControls.createControls();
    }

    public detached(): void {
        // Remove window listeners first to ensure cleanup even if later steps throw (ML-10)
        window.removeEventListener('mousemove', this._rawMouseMoveHandler);
        window.removeEventListener('keydown', this._keyDownHandler);

        this.chart.unsubscribeClick(this._clickHandler);
        this.chart.unsubscribeCrosshairMove(this._moveHandler);

        const chartElement = (this.chart as any).chartElement?.();
        if (chartElement) {
            chartElement.removeEventListener('mousedown', this._mouseDownHandler);
            chartElement.removeEventListener('mouseup', this._mouseUpHandler);
            if (this._contextMenuHandler) {
                chartElement.removeEventListener('contextmenu', this._contextMenuHandler);
                this._contextMenuHandler = null;
            }
        }

        // Unsubscribe from alerts (ML-1)
        if (this._alertSubscription) {
            this._alertSubscription.unsubscribe(this);
            this._alertSubscription = null;
        }

        // Detach all tools
        this._tools.forEach(tool => {
            try {
                this.series.detachPrimitive(tool);
            } catch (error) {
                console.error('Error detaching tool:', error);
            }
        });

        if (this._userPriceAlerts) {
            this.series.detachPrimitive(this._userPriceAlerts);
            this._userPriceAlerts = null;
        }

        // Remove chart controls
        if (this._chartControls) {
            this._chartControls.removeControls();
            this._chartControls = null;
        }

        // Cleanup toolbar (ML-4)
        if (this._toolbar) {
            this._toolbar.destroy();
            this._toolbar = null;
        }

        // Cleanup alert notifications (ML-5)
        if (this._alertNotifications) {
            this._alertNotifications.destroy();
            this._alertNotifications = null;
        }

        // Cleanup text input dialog
        if (this._textInputDialog) {
            this._textInputDialog.hide();
        }

        // Clear all state (B-2)
        this._tools = [];
        this._activeTool = null;
        this._selectedTool = null;
        this._points = [];
        this._dragState = null;
        this._isDragging = false;
        this._isDrawing = false;
        this._lastPixelPoint = null;
        this._lastClickedTool = null;
        this._lastToolClickTime = 0;
        this._dragPrevState = null;
        this._activeToolType = 'None';
        this._isRightClick = false;

        // Clear history
        this._historyManager.clear();

        // Re-enable chart interaction
        this._setChartInteraction(true);

        super.detached();
    }

    public startTool(toolType: ToolType) {
        // Clear any active drag operation (B-5)
        if (this._isDragging) {
            this._isDragging = false;
            this._dragState = null;
            this._dragPrevState = null;
            this.chart.applyOptions({ handleScroll: true, handleScale: true });
        }

        this._deselectCurrentTool();
        this._activeToolType = toolType;
        this._points = [];
        this._activeTool = null;
        this._lastPixelPoint = null;

        // Show collapsed toolbar
        // We don't have mouse coordinates here, so we might need to default or wait for mouse move
        // For now, let's put it in a default position or center
        if (toolType !== 'None' && toolType !== 'Eraser' && toolType !== 'Measure') {
            this._toolbar?.showCollapsed(toolType);
        } else {
            this._toolbar?.hide();
        }

        // Disable chart panning for drawing tools
        if (toolType === 'Brush' || toolType === 'Highlighter' || toolType === 'Triangle' || toolType === 'TrendLine' || toolType === 'HorizontalLine' || toolType === 'VerticalLine' || toolType === 'Rectangle' || toolType === 'Circle' || toolType === 'CrossLine' || toolType === 'Path' || toolType === 'Arrow' || toolType === 'Ray' || toolType === 'ExtendedLine' || toolType === 'HorizontalRay' || toolType === 'PriceRange' || toolType === 'LongPosition' || toolType === 'ShortPosition' || toolType === 'ElliottImpulseWave' || toolType === 'ElliottCorrectionWave' || toolType === 'DateRange' || toolType === 'FibExtension' || toolType === 'UserPriceAlerts' || toolType === 'Eraser' || toolType === 'PriceLabel' || toolType === 'Measure') {
            this._setChartInteraction(false);
        } else {
            // Re-enable panning for other tools
            this._setChartInteraction(true);
        }

        this._updateCursor();
    }

    public clearTools() {
        this._tools.forEach(tool => {
            this.series.detachPrimitive(tool);
        });
        this._tools = [];
        this._toolbar?.hide();
        this._drawingsHidden = false;
    }

    /**
     * Hide all drawings by detaching them from the series
     * Tools remain in memory and can be shown again
     */
    public hideAllDrawings(): void {
        if (this._drawingsHidden) return;

        this._deselectCurrentTool();
        this._toolbar?.hide();

        this._tools.forEach(tool => {
            try {
                this.series.detachPrimitive(tool);
            } catch (error) {
                // Tool may already be detached
            }
        });

        this._drawingsHidden = true;
        this.requestUpdate();
    }

    /**
     * Show all previously hidden drawings by reattaching them to the series
     */
    public showAllDrawings(): void {
        if (!this._drawingsHidden) return;

        this._tools.forEach(tool => {
            try {
                this.series.attachPrimitive(tool);
            } catch (error) {
                // Tool may already be attached
            }
        });

        this._drawingsHidden = false;
        this.requestUpdate();
    }

    /**
     * Toggle visibility of all drawings
     * @returns true if drawings are now hidden, false if shown
     */
    public toggleDrawingsVisibility(): boolean {
        if (this._drawingsHidden) {
            this.showAllDrawings();
        } else {
            this.hideAllDrawings();
        }
        return this._drawingsHidden;
    }

    /**
     * Check if drawings are currently hidden
     */
    public areDrawingsHidden(): boolean {
        return this._drawingsHidden;
    }

    /**
     * Lock all drawings to prevent dragging/moving
     */
    public lockAllDrawings(): void {
        if (this._allDrawingsLocked) return;

        // Deselect any currently selected tool
        this._deselectCurrentTool();
        this._toolbar?.hide();

        // Set lock flag on all tools
        this._tools.forEach(tool => {
            if (tool._locked !== undefined) {
                tool._locked = true;
            }
        });

        this._allDrawingsLocked = true;
    }

    /**
     * Unlock all drawings to allow dragging/moving
     */
    public unlockAllDrawings(): void {
        if (!this._allDrawingsLocked) return;

        this._tools.forEach(tool => {
            if (tool._locked !== undefined) {
                tool._locked = false;
            }
        });

        this._allDrawingsLocked = false;
    }

    /**
     * Toggle lock state for all drawings
     * @returns true if drawings are now locked, false if unlocked
     */
    public toggleDrawingsLock(): boolean {
        if (this._allDrawingsLocked) {
            this.unlockAllDrawings();
        } else {
            this.lockAllDrawings();
        }
        return this._allDrawingsLocked;
    }

    /**
     * Check if all drawings are currently locked
     */
    public areDrawingsLocked(): boolean {
        return this._allDrawingsLocked;
    }

    public updateToolOptions(toolType: ToolType, options: any) {
        const current = this._toolOptions.get(toolType) || {};
        this._toolOptions.set(toolType, { ...current, ...options });
    }

    public getToolOptions(toolType: ToolType): any {
        return this._toolOptions.get(toolType) || {};
    }

    /**
     * Toggle lock state for a tool to prevent or allow dragging
     */
    public toggleToolLock(tool: any): void {
        tool._locked = !tool._locked;
        this.requestUpdate();
    }

    public createAlertForTool(tool: any): void {
        if (this.toolSupportsAlerts(tool)) {
            this._userPriceAlerts?.openToolAlertDialog(tool);
        } else {
            console.warn('Alerts not supported for this tool type yet');
        }
    }

    public toolSupportsAlerts(tool: any): boolean {
        return tool instanceof TrendLine ||
            tool instanceof HorizontalLine ||
            tool instanceof HorizontalRay ||
            tool instanceof VerticalLine ||
            tool instanceof Rectangle ||
            tool instanceof ParallelChannel;
    }

    public enableSessionHighlighting(highlighter: SessionHighlighter): void {
        // Check if session highlighting is already active
        const existingIndex = this._tools.findIndex(t => t instanceof SessionHighlighting);

        if (existingIndex !== -1) {
            // Toggle OFF: Remove existing session highlighting
            const existingTool = this._tools[existingIndex];
            this.series.detachPrimitive(existingTool);
            this._tools.splice(existingIndex, 1);
        } else {
            // Toggle ON: Add session highlighting
            const sessionHighlighting = new SessionHighlighting(highlighter);
            this.series.attachPrimitive(sessionHighlighting);
            this._tools.push(sessionHighlighting);
        }
    }

    public disableSessionHighlighting(): void {
        const existingIndex = this._tools.findIndex(t => t instanceof SessionHighlighting);
        if (existingIndex !== -1) {
            const existingTool = this._tools[existingIndex];
            this.series.detachPrimitive(existingTool);
            this._tools.splice(existingIndex, 1);
        }
    }

    public getChartRect(): DOMRect | null {
        const chartElement = (this.chart as any).chartElement?.();
        return chartElement?.getBoundingClientRect() || null;
    }

    public setDefaultRange(range: { from: number, to: number }): void {
        this._chartControls?.setDefaultRange(range);
    }

    /**
     * Select a tool and show its anchor points
     */
    private _selectTool(tool: any): void {
        // Null check (B-3)
        if (!tool) return;

        // Deselect previous tool
        if (this._selectedTool && this._selectedTool !== tool) {
            this._selectedTool.setSelected(false);
        }

        // Select new tool
        this._selectedTool = tool;
        tool.setSelected(true);
        this.requestUpdate(); // Use requestUpdate instead of applyOptions to avoid chart movement

        // Show expanded toolbar
        this._toolbar?.showExpanded(tool);
    }

    /**
     * Deselect the currently selected tool
     */
    private _deselectCurrentTool(): void {
        if (this._selectedTool) {
            this._selectedTool.setSelected(false);
            this._selectedTool = null;
            this.requestUpdate(); // Use requestUpdate instead of applyOptions to avoid chart movement
            this._toolbar?.hide();
        }
    }

    /**
     * Public method to deselect the current tool (called from toolbar ESC button)
     */
    public deselectTool(): void {
        this._deselectCurrentTool();
    }

    /**
     * Show inline text editor for editing text/callout tools
     */
    private _showTextInputDialog(tool: Text | Callout, clickPoint?: { x: number; y: number }): void {
        // Setup text edit callback
        tool.setOnTextEdit((currentText: string) => {
            // Get screen position for inline editor
            const chartElement = (this.chart as any).chartElement?.();
            const rect = chartElement?.getBoundingClientRect();
            if (!rect) return;

            let editorPosition: { x: number; y: number };

            if (clickPoint) {
                // Position at click point
                editorPosition = {
                    x: rect.left + clickPoint.x,
                    y: rect.top + clickPoint.y - 15 // Offset slightly above
                };
            } else {
                // Calculate position from tool coordinates
                const timeScale = this.chart.timeScale();
                const series = this.series;

                if (tool instanceof Text) {
                    const x = timeScale.logicalToCoordinate(tool._point.logical as Logical);
                    const y = series.priceToCoordinate(tool._point.price);
                    if (x !== null && y !== null) {
                        editorPosition = {
                            x: rect.left + x,
                            y: rect.top + y - 15
                        };
                    } else {
                        return;
                    }
                } else if (tool instanceof Callout) {
                    const x = timeScale.logicalToCoordinate(tool._p2.logical as Logical);
                    const y = series.priceToCoordinate(tool._p2.price);
                    if (x !== null && y !== null) {
                        editorPosition = {
                            x: rect.left + x,
                            y: rect.top + y - 15
                        };
                    } else {
                        return;
                    }
                } else {
                    return;
                }
            }

            // Show inline editor
            this._textInputDialog.show(
                currentText,
                editorPosition,
                (newText: string) => {
                    if (newText.trim()) {
                        tool.updateText(newText);
                        this.requestUpdate();
                    }
                }
            );
        });

        // Trigger the edit immediately
        tool.editText();
    }

    /**
     * Delete a tool from the chart
     */
    public deleteTool(tool: any, skipHistory: boolean = false): void {
        // If this tool is being dragged, cancel the drag first (RC-1)
        if (this._dragState && this._dragState.tool === tool) {
            this._isDragging = false;
            this._dragState = null;
            this._dragPrevState = null;
            this.chart.applyOptions({ handleScroll: true, handleScale: true });
        }

        // If this is the selected tool, deselect it (RC-1)
        if (this._selectedTool === tool) {
            this._selectedTool = null;
        }

        const index = this._tools.indexOf(tool);
        if (index !== -1) {
            // Record in history before deleting
            if (!skipHistory) {
                const toolType = (tool as any).toolType || 'None';
                this._historyManager.recordDelete(tool, toolType);
            }

            // Check if tool has an associated alert and remove it
            if (tool instanceof TrendLine && tool._alertId) {
                this._userPriceAlerts?.removeAlert(tool._alertId);
            }

            this.series.detachPrimitive(tool);
            this._tools.splice(index, 1);
            this.requestUpdate(); // Use requestUpdate instead of applyOptions to avoid chart movement
            this._toolbar?.hide();
        }
    }

    /**
     * Handle tool selection when clicking in edit mode
     */
    private _handleToolSelection(param: MouseEventParams): void {
        if (!param.point) return;

        const x = param.point.x;
        const y = param.point.y;

        // Check all tools for hits (in reverse order, top to bottom)
        for (let i = this._tools.length - 1; i >= 0; i--) {
            const tool = this._tools[i];
            if (!tool.toolHitTest) continue;

            const hitResult = tool.toolHitTest(x, y);
            if (hitResult?.hit) {
                // Select tool (double-click is handled in mouseDownHandler)
                this._selectTool(tool);
                return;
            }
        }

        // No tool hit, deselect current
        this._deselectCurrentTool();
        this._lastClickedTool = null;
        this._lastToolClickTime = 0;
    }

    /**
     * Start a drag operation (anchor or shape)
     */
    private _startDrag(hitResult: any, point: { x: number, y: number }): void {
        // Check if tool is locked
        if (this._selectedTool && this._selectedTool._locked) {
            return; // Prevent dragging locked tools
        }

        const timeScale = this.chart.timeScale();
        const series = this.series;

        const logical = timeScale.coordinateToLogical(point.x);
        const price = series.coordinateToPrice(point.y);

        if (logical === null || price === null) return;

        // Capture state before drag for undo
        if (this._selectedTool) {
            const state = extractToolState(this._selectedTool);
            if (state) {
                this._dragPrevState = state;
            }
        }

        if (hitResult.type === 'point') {
            // Dragging an anchor
            this._dragState = {
                tool: this._selectedTool,
                type: 'anchor',
                anchorIndex: hitResult.index,
                startPoint: { logical, price },
            };
        } else {
            // Dragging the shape
            this._dragState = {
                tool: this._selectedTool,
                type: 'shape',
                startPoint: { logical, price },
            };
        }

        this._isDragging = true;
        this.chart.applyOptions({ handleScroll: false, handleScale: false });
    }

    /**
     * Handle active drag operation
     */
    private _handleDrag(event: MouseEvent): void {
        try {
            if (!this._isDragging || !this._dragState) {
                return;
            }

            // Check if tool still exists (RC-1)
            if (!this._dragState.tool || this._tools.indexOf(this._dragState.tool) === -1) {
                // Tool was deleted during drag, cancel operation
                this._isDragging = false;
                this._dragState = null;
                this._dragPrevState = null;
                this.chart.applyOptions({ handleScroll: true, handleScale: true });
                return;
            }

            const chartElement = (this.chart as any).chartElement?.();
            const rect = chartElement?.getBoundingClientRect();
            if (!rect) return;

            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            const timeScale = this.chart.timeScale();
            const series = this.series;

            const logical = timeScale.coordinateToLogical(x);
            const price = series.coordinateToPrice(y);

            if (logical === null || price === null) return;

            if (this._dragState.type === 'anchor') {
                // Update specific anchor point
                this._dragState.tool.updatePointByIndex(
                    this._dragState.anchorIndex,
                    { logical, price }
                );
            } else {
                // Move entire shape
                const deltaLogical = logical - this._dragState.startPoint.logical;
                const deltaPrice = price - this._dragState.startPoint.price;

                this._moveToolByDelta(this._dragState.tool, deltaLogical, deltaPrice);

                // Update start point for next delta
                this._dragState.startPoint = { logical, price };
            }

            this.requestUpdate(); // Use requestUpdate instead of applyOptions to avoid chart movement
        } catch (error) {
            console.error('Error handling drag:', error);
            // Cancel drag on error (B-4)
            this._isDragging = false;
            this._dragState = null;
            this._dragPrevState = null;
            this.chart.applyOptions({ handleScroll: true, handleScale: true });
        }
    }

    /**
     * Move a tool by delta values
     */
    private _moveToolByDelta(tool: any, deltaLogical: number, deltaPrice: number): void {
        // Check tool type and move accordingly
        if (tool._p1 && tool._p2 && !tool._p3) {
            // Two-point tools (Rectangle, Circle, TrendLine, etc.)
            tool._p1 = {
                logical: tool._p1.logical + deltaLogical,
                price: tool._p1.price + deltaPrice,
            };
            tool._p2 = {
                logical: tool._p2.logical + deltaLogical,
                price: tool._p2.price + deltaPrice,
            };
            tool.updateAllViews();
        } else if (tool._p1 && tool._p2 && tool._p3) {
            // Three-point tools (Triangle, FibExtension)
            tool._p1.logical += deltaLogical;
            tool._p1.price += deltaPrice;
            tool._p2.logical += deltaLogical;
            tool._p2.price += deltaPrice;
            tool._p3.logical += deltaLogical;
            tool._p3.price += deltaPrice;
            tool.updateAllViews();
        } else if (tool._points) {
            // Multi-point tools (Polyline, ParallelChannel, FibRetracement, ElliottImpulseWave)
            tool._points.forEach((p: LogicalPoint) => {
                p.logical += deltaLogical;
                p.price += deltaPrice;
            });
            tool.updateAllViews();
            // NOTE: LongPosition/ShortPosition are now handled by the 3-point block above (B-9)
        } else if (tool._point) {
            // Single-point tools (Text)
            tool._point = {
                logical: tool._point.logical + deltaLogical,
                price: tool._point.price + deltaPrice,
            };
            tool.updateAllViews();
        } else if (tool._price !== undefined) {
            // HorizontalLine
            tool._price += deltaPrice;
            tool.updateAllViews();
        } else if (tool._logical !== undefined) {
            // VerticalLine
            tool._logical += deltaLogical;
            tool.updateAllViews();
        }
    }

    /**
     * Handle keyboard events for editing
     */
    private _keyDownHandler = (event: KeyboardEvent): void => {
        // Handle Undo (Ctrl+Z)
        if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
            event.preventDefault();
            this.undo();
            return;
        }

        // Handle Redo (Ctrl+Y or Ctrl+Shift+Z)
        if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
            event.preventDefault();
            this.redo();
            return;
        }

        if (event.key === 'Escape') {
            if (this._activeTool) {
                this._cancelActiveDrawing();
            } else {
                this._deselectCurrentTool();
            }
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
            // Delete selected tool
            if (this._selectedTool) {
                event.preventDefault(); // Prevent browser back navigation
                this.deleteTool(this._selectedTool);
            }
        }
    };

    private _clickHandler = (param: MouseEventParams) => {
        // Ignore right-clicks early (they're handled by mouseUpHandler)
        if (this._isRightClick) {
            return;
        }

        // Handle selection when no tool is active
        if (this._activeToolType === 'None') {
            this._handleToolSelection(param);
            return;
        }

        // Handle Eraser tool
        if (this._activeToolType === 'Eraser') {
            if (!param.point) return;
            const x = param.point.x;
            const y = param.point.y;

            // Check all tools for hits (in reverse order, top to bottom)
            for (let i = this._tools.length - 1; i >= 0; i--) {
                const tool = this._tools[i];
                if (!tool.toolHitTest) continue;

                const hitResult = tool.toolHitTest(x, y);
                if (hitResult?.hit) {
                    this.deleteTool(tool);
                    return;
                }
            }
            return;
        }

        if (!param.point) return;

        // Skip for Brush/Highlighter (they use mouse drag)
        if (this._activeToolType === 'Brush' || this._activeToolType === 'Highlighter') {
            return;
        }

        const price = this.series.coordinateToPrice(param.point.y);
        if (price === null) return;

        // Convert to LogicalPoint for consistency
        const timeScale = this.chart.timeScale();
        const logical = timeScale.coordinateToLogical(param.point.x);
        if (logical === null) return;

        // All tools use LogicalPoints (B-10: removed redundant type check)
        const pointToPush: LogicalPoint = { logical, price };

        this._points.push(pointToPush);

        // Create aliases for backward compatibility with existing tool-specific code
        const point: LogicalPoint = pointToPush;
        const logicalPoint: LogicalPoint = pointToPush;

        if (this._activeToolType === 'TrendLine' || this._activeToolType === 'Arrow' || this._activeToolType === 'Ray' || this._activeToolType === 'ExtendedLine') {

            if (this._points.length === 1) {
                const p1 = this._points[0] as LogicalPoint;

                const options: any = {
                    rightEnd: this._activeToolType === 'Arrow' ? 1 : 0,
                    extendRight: this._activeToolType === 'Ray' || this._activeToolType === 'ExtendedLine',
                    extendLeft: this._activeToolType === 'ExtendedLine',
                    ...this.getToolOptions(this._activeToolType)
                };

                this._activeTool = new TrendLine(this.chart, this.series, p1, p1, options);
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof TrendLine) {
                    const p1 = this._points[0] as LogicalPoint;
                    let p2 = this._points[1] as LogicalPoint;

                    this._activeTool.updatePoints(p1, p2);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._selectTool(finishedTool);
                }
            }
        } else if (this._activeToolType === 'HorizontalRay') {
            // Finalize the horizontal ray (single click)
            if (this._activeTool instanceof HorizontalRay) {
                // Preview exists, finalize it
                const p1 = this._activeTool._point;
                this._activeTool.updatePoint(p1);

                this._addTool(this._activeTool, this._activeToolType);
                const finishedTool = this._activeTool;
                this._activeTool = null;
                this.chart.timeScale().applyOptions({});
                this._selectTool(finishedTool);
            } else {
                // No preview (click without move)
                const p1 = point;
                const tool = new HorizontalRay(this.chart, this.series, p1, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(tool);
                this._addTool(tool, this._activeToolType);
                this.chart.timeScale().applyOptions({});
                this._selectTool(tool);
            }
            this._points = [];
        } else if (this._activeToolType === 'HorizontalLine') {
            // Finalize the horizontal line
            if (this._activeTool instanceof HorizontalLine) {
                this._activeTool.updatePrice(price);
                this._addTool(this._activeTool, this._activeToolType);
                const finishedTool = this._activeTool;
                this._activeTool = null; // Detach from active, but it remains in series
                this.chart.timeScale().applyOptions({});
                this._selectTool(finishedTool);
            } else {
                const tool = new HorizontalLine(this.chart, this.series, price, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(tool);
                this._addTool(tool, this._activeToolType);
                this.chart.timeScale().applyOptions({});
                this._selectTool(tool);
            }
            this._points = [];
        } else if (this._activeToolType === 'VerticalLine') {
            // Finalize the vertical line
            if (this._activeTool instanceof VerticalLine) {
                this._activeTool.updatePosition(logical);
                this._addTool(this._activeTool, this._activeToolType);
                const finishedTool = this._activeTool;
                this._activeTool = null;
                this.chart.timeScale().applyOptions({});
                this._selectTool(finishedTool);
            } else {
                const tool = new VerticalLine(this.chart, this.series, logical, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(tool);
                this._addTool(tool, this._activeToolType);
                this.chart.timeScale().applyOptions({});
                this._selectTool(tool);
            }
            this._points = [];
        } else if (this._activeToolType === 'Text') {
            const tool = new Text(this.chart, this.series, point, 'Add text', this.getToolOptions(this._activeToolType));
            this.series.attachPrimitive(tool);
            this._addTool(tool, this._activeToolType);
            this._points = [];
            this.chart.timeScale().applyOptions({});
            this._selectTool(tool);

            // Show inline text editor immediately after creating
            this._showTextInputDialog(tool, param.point);
        } else if (this._activeToolType === 'Callout') {
            if (this._points.length === 1) {
                // First click - create callout with anchor point
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool = new Callout(this.chart, this.series, p1, p1, 'Add text', this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                // Second click - finalize and show text editor
                if (this._activeTool instanceof Callout) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._selectTool(finishedTool);

                    // Show inline text editor at the text box position
                    this._showTextInputDialog(finishedTool, param.point);
                }
            }
        } else if (this._activeToolType === 'PriceLabel') {
            const formattedPrice = this.series.priceFormatter().format(point.price);
            const tool = new PriceLabel(this.chart, this.series, point, formattedPrice, this.getToolOptions(this._activeToolType));
            this.series.attachPrimitive(tool);
            this._addTool(tool, this._activeToolType);
            this._points = [];
            this.chart.timeScale().applyOptions({});
            this._selectTool(tool);
        } else if (this._activeToolType === 'ParallelChannel') {
            if (this._points.length === 1) {
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool = new ParallelChannel(this.chart, this.series, p1, p1, p1, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof ParallelChannel) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2, p2);
                }
            } else if (this._points.length === 3) {
                if (this._activeTool instanceof ParallelChannel) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    const p3 = this._points[2] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2, p3);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._selectTool(finishedTool);
                }
            }
        } else if (this._activeToolType === 'FibRetracement') {
            if (this._points.length === 1) {
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool = new FibRetracement(this.chart, this.series, p1, p1, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof FibRetracement) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._selectTool(finishedTool);
                }
            }
        } else if (this._activeToolType === 'Triangle') {
            if (this._points.length === 1) {
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool = new Triangle(this.chart, this.series, p1, p1, p1, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof Triangle) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2, p2);
                }
            } else if (this._points.length === 3) {
                if (this._activeTool instanceof Triangle) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    const p3 = this._points[2] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2, p3);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._selectTool(finishedTool);
                }
            }
        } else if (this._activeToolType === 'LongPosition') {
            if (this._points.length === 1) {
                const p1 = this._points[0] as LogicalPoint;
                // Initial state: p2 and p3 same as p1
                this._activeTool = new LongPosition(this.chart, this.series, p1, p1, p1, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof LongPosition) {
                    const p1 = this._points[0] as LogicalPoint;
                    const targetPoint = this._points[1] as LogicalPoint; // Mouse is Target (p3)

                    // Calculate Stop Loss (p2) automatically for 1:1 RR
                    // Target > Entry (usually for Long).
                    // Stop should be Entry - (Target - Entry)
                    const priceDiff = targetPoint.price - p1.price;
                    const stopPrice = p1.price - priceDiff;

                    const stopPoint: LogicalPoint = {
                        logical: targetPoint.logical,
                        price: stopPrice
                    };

                    this._activeTool.updatePoints(p1, stopPoint, targetPoint);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._selectTool(finishedTool);
                }
            }
        } else if (this._activeToolType === 'ShortPosition') {
            // Store LogicalPoints for ShortPosition
            if (logicalPoint) {
                this._points[this._points.length - 1] = logicalPoint;
            }

            if (this._points.length === 1) {
                const p1 = this._points[0] as LogicalPoint;
                // Initial state: p2 and p3 same as p1
                this._activeTool = new ShortPosition(this.chart, this.series, p1, p1, p1, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof ShortPosition) {
                    const p1 = this._points[0] as LogicalPoint;
                    const targetPoint = this._points[1] as LogicalPoint; // Mouse is Target (p3)

                    // Calculate Stop Loss (p2) automatically for 1:1 RR
                    // Target < Entry (usually for Short).
                    // Stop should be Entry + (Entry - Target)
                    const priceDiff = p1.price - targetPoint.price;
                    const stopPrice = p1.price + priceDiff;

                    const stopPoint: LogicalPoint = {
                        logical: targetPoint.logical,
                        price: stopPrice
                    };

                    this._activeTool.updatePoints(p1, stopPoint, targetPoint);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._selectTool(finishedTool);
                }
            }
        } else if (this._activeToolType === 'CrossLine') {
            const tool = new CrossLine(this.chart, this.series, point, this.getToolOptions(this._activeToolType));
            this.series.attachPrimitive(tool);
            this._addTool(tool, this._activeToolType);
            this._points = [];
            this.chart.timeScale().applyOptions({});
            this._selectTool(tool);

        } else if (this._activeToolType === 'Rectangle') {
            // Store LogicalPoints for Rectangle
            if (logicalPoint) {
                this._points[this._points.length - 1] = logicalPoint;
            }

            if (this._points.length === 1) {
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool = new Rectangle(this.chart, this.series, p1, p1, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof Rectangle) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._selectTool(finishedTool);
                }
            }
        } else if (this._activeToolType === 'PriceRange') {
            // Store LogicalPoints for PriceRange
            if (logicalPoint) {
                this._points[this._points.length - 1] = logicalPoint;
            }

            if (this._points.length === 1) {
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool = new PriceRange(this.chart, this.series, p1, p1, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof PriceRange) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._selectTool(finishedTool);
                }
            }
        } else if (this._activeToolType === 'Circle') {
            // Store LogicalPoints for Circle
            if (logicalPoint) {
                this._points[this._points.length - 1] = logicalPoint;
            }

            if (this._points.length === 1) {
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool = new Circle(this.chart, this.series, p1, p1, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof Circle) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._selectTool(finishedTool);
                }
            }
        } else if (this._activeToolType === 'ElliottImpulseWave') {
            if (this._points.length === 1) {
                this._activeTool = new ElliottImpulseWave(this.chart, this.series, [point], this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else {
                if (this._activeTool instanceof ElliottImpulseWave) {
                    this._activeTool.addPoint(point);
                    if (this._points.length === 6) {
                        // Completed 5 waves (6 points: 0, 1, 2, 3, 4, 5)
                        const finishedTool = this._activeTool;
                        this._activeTool = null;
                        this._points = [];
                        this._selectTool(finishedTool);
                    }
                }
            }
        } else if (this._activeToolType === 'ElliottCorrectionWave') {
            if (this._points.length === 1) {
                this._activeTool = new ElliottCorrectionWave(this.chart, this.series, [point], this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else {
                if (this._activeTool instanceof ElliottCorrectionWave) {
                    this._activeTool.addPoint(point);
                    if (this._points.length === 4) {
                        // Completed 3 waves (4 points: 0, A, B, C)
                        const finishedTool = this._activeTool;
                        this._activeTool = null;
                        this._points = [];
                        this._selectTool(finishedTool);
                    }
                }
            }
        } else if (this._activeToolType === 'HeadAndShoulders') {
            if (this._points.length === 1) {
                this._activeTool = new HeadAndShoulders(this.chart, this.series, [point], this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else {
                if (this._activeTool instanceof HeadAndShoulders) {
                    this._activeTool.addPoint(point);
                    if (this._points.length === 7) {
                        // Completed 7 points pattern
                        const finishedTool = this._activeTool;
                        this._activeTool = null;
                        this._points = [];
                        this._selectTool(finishedTool);
                    }
                }
            }
        } else if (this._activeToolType === 'DateRange') {
            // Store LogicalPoints for DateRange
            if (logicalPoint) {
                this._points[this._points.length - 1] = logicalPoint;
            }

            if (this._points.length === 1) {
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool = new DateRange(this.chart, this.series, p1, p1, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof DateRange) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._selectTool(finishedTool);
                }
            }
        } else if (this._activeToolType === 'DatePriceRange') {
            // Store LogicalPoints for DatePriceRange
            if (logicalPoint) {
                this._points[this._points.length - 1] = logicalPoint;
            }

            if (this._points.length === 1) {
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool = new DatePriceRange(this.chart, this.series, p1, p1, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof DatePriceRange) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._selectTool(finishedTool);
                }
            }
        } else if (this._activeToolType === 'Measure') {
            // Store LogicalPoints for Measure
            if (logicalPoint) {
                this._points[this._points.length - 1] = logicalPoint;
            }

            if (this._points.length === 1) {
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool = new Measure(this.chart, this.series, p1, p1, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof Measure) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    // Don't select tool (no floating toolbar for Measure)
                    finishedTool.setSelected(false);
                }
            }
        } else if (this._activeToolType === 'FibExtension') {
            if (this._points.length === 1) {
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool = new FibExtension(this.chart, this.series, p1, p1, p1, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof FibExtension) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2, p2);
                }
            } else if (this._points.length === 3) {
                if (this._activeTool instanceof FibExtension) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    const p3 = this._points[2] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2, p3);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._selectTool(finishedTool);
                }
            }
        } else if (this._activeToolType === 'Path') {
            // Path tool with double-click to finish
            const now = Date.now();
            const timeSinceLastClick = now - this._lastClickTime;

            // Check for double-click (within 300ms and within 10px)
            if (timeSinceLastClick < 300 && this._lastClickPoint && param.point) {
                const dx = Math.abs(param.point.x - this._lastClickPoint.x);
                const dy = Math.abs(param.point.y - this._lastClickPoint.y);

                // If clicked in same area, finalize (minimum 2 points for a path)
                if (dx < 10 && dy < 10 && this._points.length >= 2) {
                    // Remove the duplicate point that was just added
                    this._points.pop();

                    if (this._activeTool instanceof Path) {
                        this._activeTool.updatePoints([...this._points]);
                    }

                    // Finalize path
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._lastClickTime = 0;
                    this._lastClickPoint = null;
                    this._selectTool(finishedTool);
                    return;
                }
            }

            this._lastClickTime = now;
            this._lastClickPoint = param.point ? { x: param.point.x, y: param.point.y } : null;

            // Continue adding points to path
            if (this._points.length === 1) {
                const options = { ...PolylinePresets.path, ...this.getToolOptions(this._activeToolType) };
                this._activeTool = new Path(this.chart, this.series, [...this._points], options);
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._activeTool instanceof Path) {
                // Sync points with manager state (overwrites preview state)
                this._activeTool.updatePoints([...this._points]);
            }
        }
    };

    private _moveHandler = (param: MouseEventParams) => {
        if (this._activeToolType === 'None') return;
        if (!param.point) return;

        const price = this.series.coordinateToPrice(param.point.y);
        if (price === null) return;

        // Convert to LogicalPoint for consistency
        const timeScale_move = this.chart.timeScale();
        const logical_move = timeScale_move.coordinateToLogical(param.point.x);
        if (logical_move === null) return;
        const currentPoint: LogicalPoint = { logical: logical_move, price };

        // Skip for Brush/Highlighter (use raw mouse handler)
        if (this._activeToolType === 'Brush' || this._activeToolType === 'Highlighter') {
            return;
        }

        if (this._activeToolType === 'HorizontalLine' && this._activeTool instanceof HorizontalLine) {
            this._activeTool.updatePrice(price);
            this.chart.timeScale().applyOptions({});
        } else if (this._activeToolType === 'VerticalLine' && this._activeTool instanceof VerticalLine) {
            this._activeTool.updatePosition(logical_move);
            this.chart.timeScale().applyOptions({});
        } else if (this._activeToolType === 'CrossLine' && this._activeTool instanceof CrossLine) {
            this._activeTool.updatePoint(currentPoint);
            this.chart.timeScale().applyOptions({});
        } else if (this._activeToolType === 'HorizontalRay' && this._activeTool instanceof HorizontalRay) {
            this._activeTool.updatePoint(currentPoint);
            this.chart.timeScale().applyOptions({});
        } else if ((this._activeToolType === 'TrendLine' || this._activeToolType === 'Arrow' || this._activeToolType === 'Ray' || this._activeToolType === 'ExtendedLine') && this._activeTool instanceof TrendLine) {
            // Calculate logical point for smooth preview
            const timeScale = this.chart.timeScale();
            const x = param.point.x;
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                let logicalPoint: LogicalPoint = { logical, price };
                const p1 = this._points[0] as LogicalPoint;

                this._activeTool.updatePoints(p1, logicalPoint);
                this.chart.timeScale().applyOptions({});
            }
        } else if (this._activeToolType === 'FibRetracement' && this._activeTool instanceof FibRetracement) {
            // Calculate logical point for smooth preview
            const timeScale = this.chart.timeScale();
            const x = param.point.x;
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                const logicalPoint = { logical, price };
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool.updatePoints(p1, logicalPoint);
                this.chart.timeScale().applyOptions({});
            }
        } else if (this._activeToolType === 'ParallelChannel' && this._activeTool instanceof ParallelChannel) {
            // Calculate logical point for smooth preview
            const timeScale = this.chart.timeScale();
            const x = param.point.x;
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                const logicalPoint = { logical, price };
                if (this._points.length === 1) {
                    const p1 = this._points[0] as LogicalPoint;
                    this._activeTool.updatePoints(p1, logicalPoint, logicalPoint);
                } else if (this._points.length === 2) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2, logicalPoint);
                }
                this.chart.timeScale().applyOptions({});
            }
        } else if (this._activeToolType === 'Triangle' && this._activeTool instanceof Triangle) {
            // Calculate logical point for smooth preview
            const timeScale = this.chart.timeScale();
            const x = param.point.x;
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                const logicalPoint = { logical, price };
                if (this._points.length === 1) {
                    const p1 = this._points[0] as LogicalPoint;
                    this._activeTool.updatePoints(p1, logicalPoint, logicalPoint);
                } else if (this._points.length === 2) {
                    const p1 = this._points[0] as LogicalPoint;
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2, logicalPoint);
                }
                this.chart.timeScale().applyOptions({});
            }
        } else if (this._activeToolType === 'PriceRange' && this._activeTool instanceof PriceRange) {
            // Calculate logical point for smooth preview
            const timeScale = this.chart.timeScale();
            const x = param.point.x;
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                const logicalPoint = { logical, price };
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool.updatePoints(p1, logicalPoint);
                this.chart.timeScale().applyOptions({});
            }
        } else if (this._activeToolType === 'Circle' && this._activeTool instanceof Circle) {
            // Calculate logical point for smooth preview
            const timeScale = this.chart.timeScale();
            const x = param.point.x;
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                const logicalPoint = { logical, price };
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool.updatePoints(p1, logicalPoint);
                this.chart.timeScale().applyOptions({});
            }
        } else if (this._activeToolType === 'Rectangle' && this._activeTool instanceof Rectangle) {
            // Calculate logical point for smooth preview
            const timeScale = this.chart.timeScale();
            const x = param.point.x;
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                const logicalPoint = { logical, price };
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool.updatePoints(p1, logicalPoint);
                this.chart.timeScale().applyOptions({});
            }
        } else if (this._activeToolType === 'Callout' && this._activeTool instanceof Callout) {
            // Calculate logical point for smooth preview
            const timeScale = this.chart.timeScale();
            const x = param.point.x;
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                const logicalPoint = { logical, price };
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool.updatePoints(p1, logicalPoint);
                this.chart.timeScale().applyOptions({});
            }
        } else if (this._activeToolType === 'LongPosition' && this._activeTool instanceof LongPosition) {
            // Calculate logical point for smooth preview
            const timeScale = this.chart.timeScale();
            const x = param.point.x;
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                const logicalPoint = { logical, price };
                if (this._points.length === 1) {
                    const p1 = this._points[0] as LogicalPoint;
                    const targetPoint = logicalPoint; // Mouse is Target (p3)

                    // Calculate Stop Loss (p2) automatically for 1:1 RR
                    const priceDiff = targetPoint.price - p1.price;
                    const stopPrice = p1.price - priceDiff;

                    const stopPoint: LogicalPoint = {
                        logical: targetPoint.logical,
                        price: stopPrice
                    };

                    this._activeTool.updatePoints(p1, stopPoint, targetPoint);
                    this.chart.timeScale().applyOptions({});
                }
            }
        } else if (this._activeToolType === 'ShortPosition' && this._activeTool instanceof ShortPosition) {
            // Calculate logical point for smooth preview
            const timeScale = this.chart.timeScale();
            const x = param.point.x;
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                const logicalPoint = { logical, price };
                if (this._points.length === 1) {
                    const p1 = this._points[0] as LogicalPoint;
                    const targetPoint = logicalPoint; // Mouse is Target (p3)

                    // Calculate Stop Loss (p2) automatically for 1:1 RR
                    const priceDiff = p1.price - targetPoint.price;
                    const stopPrice = p1.price + priceDiff;

                    const stopPoint: LogicalPoint = {
                        logical: targetPoint.logical,
                        price: stopPrice
                    };

                    this._activeTool.updatePoints(p1, stopPoint, targetPoint);
                    this.chart.timeScale().applyOptions({});
                }
            }
        } else if (this._activeToolType === 'Path' && this._activeTool instanceof Path && this._points.length >= 1) {
            // Preview the next line segment
            const allPoints = [...this._points, currentPoint];
            this._activeTool.updatePoints(allPoints);
            this.chart.timeScale().applyOptions({});
        } else if (this._activeToolType === 'ElliottImpulseWave' && this._activeTool instanceof ElliottImpulseWave && this._points.length >= 1) {
            // Preview the next line segment
            const allPoints = [...this._points, currentPoint];
            this._activeTool.updatePoints(allPoints);
            this.chart.timeScale().applyOptions({});
        } else if (this._activeToolType === 'ElliottCorrectionWave' && this._activeTool instanceof ElliottCorrectionWave && this._points.length >= 1) {
            // Preview the next line segment
            const allPoints = [...this._points, currentPoint];
            this._activeTool.updatePoints(allPoints);
            this.chart.timeScale().applyOptions({});
        } else if (this._activeToolType === 'HeadAndShoulders' && this._activeTool instanceof HeadAndShoulders && this._points.length >= 1) {
            // Preview the next line segment
            const allPoints = [...this._points, currentPoint];
            this._activeTool.updatePoints(allPoints);
            this.chart.timeScale().applyOptions({});
        } else if (this._activeToolType === 'DateRange' && this._activeTool instanceof DateRange) {
            // Calculate logical point for smooth preview
            const timeScale = this.chart.timeScale();
            const x = param.point.x;
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                const logicalPoint = { logical, price };
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool.updatePoints(p1, logicalPoint);
                this.chart.timeScale().applyOptions({});
            }
        } else if (this._activeToolType === 'DatePriceRange' && this._activeTool instanceof DatePriceRange) {
            // Calculate logical point for smooth preview
            const timeScale = this.chart.timeScale();
            const x = param.point.x;
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                const logicalPoint = { logical, price };
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool.updatePoints(p1, logicalPoint);
                this.chart.timeScale().applyOptions({});
            }
        } else if (this._activeToolType === 'Measure' && this._activeTool instanceof Measure) {
            // Calculate logical point for smooth preview
            const timeScale = this.chart.timeScale();
            const x = param.point.x;
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                const logicalPoint = { logical, price };
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool.updatePoints(p1, logicalPoint);
                this.chart.timeScale().applyOptions({});
            }
        } else if (this._activeToolType === 'FibExtension' && this._activeTool instanceof FibExtension) {
            const timeScale = this.chart.timeScale();
            const x = param.point.x;
            const logical = timeScale.coordinateToLogical(x);
            if (logical !== null) {
                const logicalPoint = { logical, price };
                const p1 = this._points[0] as LogicalPoint;
                if (this._points.length === 1) {
                    this._activeTool.updatePoints(p1, logicalPoint, logicalPoint);
                } else if (this._points.length === 2) {
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(p1, p2, logicalPoint);
                }
                this.chart.timeScale().applyOptions({});
            }
        }
    };

    private _mouseDownHandler = (event: MouseEvent) => {
        // Track right-click
        this._isRightClick = event.button === 2;
        if (this._isRightClick) {
            return;
        }

        // Handle editing: check if clicking on selected tool
        if (this._selectedTool && this._activeToolType === 'None' && event.button === 0) {
            const chartElement = (this.chart as any).chartElement?.();
            const rect = chartElement?.getBoundingClientRect();
            if (rect) {
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;

                const hitResult = this._selectedTool.toolHitTest(x, y);
                if (hitResult?.hit) {
                    // Check for double-click on Text or Callout tools
                    const now = Date.now();
                    const isDoubleClick =
                        this._lastClickedTool === this._selectedTool &&
                        (now - this._lastToolClickTime) < 300;

                    if (isDoubleClick && (this._selectedTool instanceof Text || this._selectedTool instanceof Callout)) {
                        // Double-click detected - open text editor instead of dragging
                        event.preventDefault();
                        this._showTextInputDialog(this._selectedTool, { x, y });
                        this._lastClickedTool = null;
                        this._lastToolClickTime = 0;
                        return;
                    }

                    // Single click - start drag
                    this._lastClickedTool = this._selectedTool;
                    this._lastToolClickTime = now;
                    event.preventDefault();
                    this._startDrag(hitResult, { x, y });
                    return;
                }
            }
        }

        // Left-click starts drawing for Brush/Highlighter/Rectangle/Circle
        if (event.button === 0 && (this._activeToolType === 'Brush' || this._activeToolType === 'Highlighter')) {
            event.preventDefault();
            event.stopPropagation();
            this._isDrawing = true;
            this._points = [];
            this._lastPixelPoint = null;
            this._activeTool = null;
        }
    };

    private _mouseUpHandler = (event: MouseEvent) => {
        // Handle editing drag end
        if (this._isDragging) {
            this._endDrag();
            return;
        }

        // Left-click release stops drawing
        if (event.button === 0 && this._isDrawing) {
            event.preventDefault();
            event.stopPropagation();
            this._isDrawing = false;
            if (this._activeTool) {
                this._selectTool(this._activeTool);
            }
            this._activeTool = null;
            this._points = [];
        }

        // Right-click cancels the drawing
        if (event.button === 2) {
            event.preventDefault();

            // For Path tool, right-click finishes the drawing if we have enough points
            if (this._activeToolType === 'Path' && this._points.length >= 2) {
                // Revert to confirmed points (exclude the current mouse preview point)
                if (this._activeTool instanceof Path) {
                    this._activeTool.updatePoints([...this._points]);
                }
                const finishedTool = this._activeTool;
                this._activeTool = null;
                this._points = [];
                this._selectTool(finishedTool);
                this._isRightClick = false;
                return;
            }

            this._cancelActiveDrawing();
            this._isRightClick = false;
            return;
        }
        this._isRightClick = false;
    };

    private _rawMouseMoveHandler = (event: MouseEvent) => {
        // Update toolbar position if it's following mouse (optional, for now we keep it static after show)
        // But if we want the collapsed icon to follow mouse until click:
        if (this._activeToolType !== 'None' && !this._activeTool && !this._selectedTool) {
            // this._toolbar.updatePosition(event.clientX + 20, event.clientY + 20);
        }

        // Handle editing drag
        if (this._isDragging && this._dragState) {
            event.preventDefault();
            this._handleDrag(event);
            return;
        }

        // Smooth drawing with raw coordinates
        if (!this._isDrawing || (this._activeToolType !== 'Brush' && this._activeToolType !== 'Highlighter')) {
            return;
        }

        const chartElement = (this.chart as any).chartElement?.();
        if (!chartElement) return;

        const rect = chartElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const timeScale = this.chart.timeScale();
        const logical = timeScale.coordinateToLogical(x);
        const price = this.series.coordinateToPrice(y);

        if (logical === null || price === null) return;

        // Use LogicalPoint for continuous coordinates
        const currentPoint: LogicalPoint = { logical, price };

        // Brush/Highlighter logic
        // Scale minDistance by horizontalPixelRatio for DPI awareness
        const scope = (this.chart as any)._impl?.model?.().rendererOptionsProvider?.().options();
        const pixelRatio = scope?.horizontalPixelRatio || window.devicePixelRatio || 1;
        const minDistance = 10 * pixelRatio;

        if (this._lastPixelPoint) {
            const dx = x - this._lastPixelPoint.x;
            const dy = y - this._lastPixelPoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < minDistance) {
                return;
            }
        }

        if (this._points.length === 0) {
            // Start stroke
            this._points.push(currentPoint);
            this._lastPixelPoint = { x, y };
            const preset = this._activeToolType === 'Brush' ? PolylinePresets.brush : PolylinePresets.highlighter;
            const savedOptions = this.getToolOptions(this._activeToolType);
            // Merge saved options into preset
            const options = { ...preset, ...savedOptions };
            // Ensure lineColor/color consistency
            if (options.lineColor) options.color = options.lineColor;

            this._activeTool = new Polyline(this.chart, this.series, [currentPoint], options);
            this.series.attachPrimitive(this._activeTool);
            this._addTool(this._activeTool, this._activeToolType);
        } else {
            // Continue stroke
            if (this._activeTool instanceof Polyline) {
                this._activeTool.addPoint(currentPoint);
                this._lastPixelPoint = { x, y };
                this.chart.timeScale().applyOptions({});
            }
        }
    };

    private _addTool(tool: any, type: ToolType, skipHistory: boolean = false) {
        try {
            (tool as any).toolType = type;
            this._tools.push(tool);

            // Record in history with validation (RC-6)
            if (!skipHistory) {
                // Verify tool state can be extracted before recording
                const toolState = extractToolState(tool);
                if (toolState) {
                    // Record in history after successful attachment
                    requestAnimationFrame(() => {
                        // Double-check tool still exists and is attached
                        if (this._tools.indexOf(tool) !== -1) {
                            this._historyManager.recordAdd(tool, type);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error adding tool:', error);
            // Remove from array if attachment failed
            const index = this._tools.indexOf(tool);
            if (index !== -1) {
                this._tools.splice(index, 1);
            }
            throw error;
        }
    }

    /**
     * End drag operation and record in history if changed
     */
    private _endDrag(): void {
        if (this._isDragging && this._dragState && this._dragPrevState) {
            const tool = this._dragState.tool;
            const toolType = (tool as any).toolType || 'None';
            this._historyManager.recordModify(tool, toolType, this._dragPrevState);
        }
        this._isDragging = false;
        this._dragState = null;
        this._dragPrevState = null;
        this.chart.applyOptions({ handleScroll: true, handleScale: true });
    }

    /**
     * Undo the last action
     */
    public undo(): void {
        // Prevent undo during active drag (RC-4)
        if (this._isDragging) {
            return;
        }

        const action = this._historyManager.popUndo();
        if (!action) return;

        // Cancel any active drawing (RC-4)
        if (this._activeTool) {
            this._cancelActiveDrawing();
        }

        this._deselectCurrentTool();

        if (action.type === 'add') {
            // Undo add = remove tool (without recording)
            const index = this._tools.indexOf(action.tool);
            if (index !== -1) {
                this.series.detachPrimitive(action.tool);
                this._tools.splice(index, 1);
                this.requestUpdate();
            }
        } else if (action.type === 'delete') {
            // Undo delete = re-add tool
            this.series.attachPrimitive(action.tool);
            this._tools.push(action.tool);
            this.requestUpdate();
        } else if (action.type === 'modify' && action.prevState) {
            // Undo modify = restore previous state
            applyToolState(action.tool, action.prevState);
            this.requestUpdate();
        }

        this._toolbar?.hide();
    }

    /**
     * Redo the last undone action
     */
    public redo(): void {
        // Prevent redo during active drag (RC-4)
        if (this._isDragging) {
            return;
        }

        const action = this._historyManager.popRedo();
        if (!action) return;

        // Cancel any active drawing (RC-4)
        if (this._activeTool) {
            this._cancelActiveDrawing();
        }

        this._deselectCurrentTool();

        if (action.type === 'add') {
            // Redo add = re-add tool
            this.series.attachPrimitive(action.tool);
            this._tools.push(action.tool);
            this.requestUpdate();
        } else if (action.type === 'delete') {
            // Redo delete = remove tool
            const index = this._tools.indexOf(action.tool);
            if (index !== -1) {
                this.series.detachPrimitive(action.tool);
                this._tools.splice(index, 1);
                this.requestUpdate();
            }
        } else if (action.type === 'modify' && action.newState) {
            // Redo modify = apply new state
            applyToolState(action.tool, action.newState);
            this.requestUpdate();
        }

        this._toolbar?.hide();
    }

    /**
     * Get history manager for external access (e.g., floating toolbar)
     */
    public getHistoryManager(): HistoryManager {
        return this._historyManager;
    }
}
