
import {
    MouseEventParams,
    Logical,
    SeriesAttachedParameter,
    Time,
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

export type ToolType = 'TrendLine' | 'HorizontalLine' | 'VerticalLine' | 'Rectangle' | 'Text' | 'ParallelChannel' | 'FibRetracement' | 'Triangle' | 'Brush' | 'Callout' | 'CrossLine' | 'Circle' | 'Highlighter' | 'Path' | 'Arrow' | 'Ray' | 'ExtendedLine' | 'HorizontalRay' | 'PriceRange' | 'LongPosition' | 'ShortPosition' | 'ElliottImpulseWave' | 'ElliottCorrectionWave' | 'DateRange' | 'FibExtension' | 'UserPriceAlerts' | 'None';

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
    private _activeTool: TrendLine | HorizontalLine | VerticalLine | Rectangle | Text | ParallelChannel | FibRetracement | Triangle | Polyline | Callout | CrossLine | Circle | Path | PriceRange | LongPosition | ShortPosition | ElliottImpulseWave | ElliottCorrectionWave | DateRange | FibExtension | HorizontalRay | null = null;
    private _points: LogicalPoint[] = [];
    private _tools: any[] = []; // Store all created tools
    private _toolOptions: Map<ToolType, any> = new Map(); // Store default options for each tool type
    private _isDrawing: boolean = false; // Track if currently drawing
    private _lastPixelPoint: { x: number, y: number } | null = null;
    private _isRightClick: boolean = false; // Track right-click to prevent adding points
    private _lastMouseEvent: MouseEvent | null = null;

    // Editing state
    private _selectedTool: any | null = null;        // Currently selected tool
    private _dragState: DragState | null = null;     // Active drag operation
    private _isDragging: boolean = false;             // Is user dragging?

    // Path tool double-click detection
    private _lastClickTime: number = 0;
    private _lastClickPoint: { x: number, y: number } | null = null;

    private _userPriceAlerts: UserPriceAlerts | null = null;
    private _alertNotifications: AlertNotification | null = null;
    private _toolbar: FloatingToolbar | null = null;

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
            'DateRange', 'FibExtension', 'UserPriceAlerts'
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
            chartElement.addEventListener('contextmenu', (e: MouseEvent) => e.preventDefault());
        }

        // Global mousemove for smooth drawing
        window.addEventListener('mousemove', this._rawMouseMoveHandler);

        // Initialize UserPriceAlerts and AlertNotification
        this._userPriceAlerts = new UserPriceAlerts();
        this.series.attachPrimitive(this._userPriceAlerts);

        this._alertNotifications = new AlertNotification(this);
        this._userPriceAlerts!.alertTriggered().subscribe((crossing) => {
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
    }

    public detached(): void {
        this.chart.unsubscribeClick(this._clickHandler);
        this.chart.unsubscribeCrosshairMove(this._moveHandler);

        window.removeEventListener('mousemove', this._rawMouseMoveHandler);
        window.removeEventListener('keydown', this._keyDownHandler);

        const chartElement = (this.chart as any).chartElement?.();
        if (chartElement) {
            chartElement.removeEventListener('mousedown', this._mouseDownHandler);
            chartElement.removeEventListener('mouseup', this._mouseUpHandler);
        }

        if (this._userPriceAlerts) {
            this.series.detachPrimitive(this._userPriceAlerts);
        }

        super.detached();
    }

    public startTool(toolType: ToolType) {
        this._deselectCurrentTool();
        this._activeToolType = toolType;
        this._points = [];
        this._activeTool = null;
        this._lastPixelPoint = null;

        // Show collapsed toolbar
        // We don't have mouse coordinates here, so we might need to default or wait for mouse move
        // For now, let's put it in a default position or center
        if (toolType !== 'None') {
            this._toolbar?.showCollapsed(toolType);
        } else {
            this._toolbar?.hide();
        }

        // Disable chart panning for drawing tools
        if (toolType === 'Brush' || toolType === 'Highlighter' || toolType === 'Triangle' || toolType === 'TrendLine' || toolType === 'HorizontalLine' || toolType === 'VerticalLine' || toolType === 'Rectangle' || toolType === 'Circle' || toolType === 'CrossLine' || toolType === 'Path' || toolType === 'Arrow' || toolType === 'Ray' || toolType === 'ExtendedLine' || toolType === 'HorizontalRay' || toolType === 'PriceRange' || toolType === 'LongPosition' || toolType === 'ShortPosition' || toolType === 'ElliottImpulseWave' || toolType === 'ElliottCorrectionWave' || toolType === 'DateRange' || toolType === 'FibExtension' || toolType === 'UserPriceAlerts') {
            this._setChartInteraction(false);
        } else {
            // Re-enable panning for other tools
            this._setChartInteraction(true);
        }
    }

    public clearTools() {
        this._tools.forEach(tool => {
            this.series.detachPrimitive(tool);
        });
        this._tools = [];
        this._toolbar?.hide();
    }

    public updateToolOptions(toolType: ToolType, options: any) {
        const current = this._toolOptions.get(toolType) || {};
        this._toolOptions.set(toolType, { ...current, ...options });
    }

    public getToolOptions(toolType: ToolType): any {
        return this._toolOptions.get(toolType) || {};
    }

    public enableSessionHighlighting(highlighter: SessionHighlighter): void {
        const sessionHighlighting = new SessionHighlighting(highlighter);
        this.series.attachPrimitive(sessionHighlighting);
        // We don't add it to this._tools because it's not interactive (no toolHitTest)
        // and doesn't need to be selected or deleted via the toolbar.
        // However, if we want to support clearing it with clearTools(), we might need to track it.
        this._tools.push(sessionHighlighting);
    }

    public getChartRect(): DOMRect | null {
        const chartElement = (this.chart as any).chartElement?.();
        return chartElement?.getBoundingClientRect() || null;
    }

    /**
     * Select a tool and show its anchor points
     */
    private _selectTool(tool: any): void {
        // Deselect previous tool
        if (this._selectedTool && this._selectedTool !== tool) {
            this._selectedTool.setSelected(false);
        }

        // Select new tool
        this._selectedTool = tool;
        tool.setSelected(true);
        this.requestUpdate(); // Use requestUpdate instead of applyOptions to avoid chart movement

        // Show expanded toolbar
        // We need coordinates. For now, use last mouse event or center
        if (this._lastMouseEvent) {
            this._toolbar?.showExpanded(tool);
        } else {
            this._toolbar?.showExpanded(tool);
        }
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
     * Delete a tool from the chart
     */
    public deleteTool(tool: any): void {
        const index = this._tools.indexOf(tool);
        if (index !== -1) {
            this.series.detachPrimitive(tool);
            this._tools.splice(index, 1);
            this._selectedTool = null;
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
                this._selectTool(tool);
                return;
            }
        }

        // No tool hit, deselect current
        this._deselectCurrentTool();
    }

    /**
     * Start a drag operation (anchor or shape)
     */
    private _startDrag(hitResult: any, point: { x: number, y: number }): void {
        const timeScale = this.chart.timeScale();
        const series = this.series;

        const logical = timeScale.coordinateToLogical(point.x);
        const price = series.coordinateToPrice(point.y);

        if (logical === null || price === null) return;

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
        const chartElement = (this.chart as any).chartElement?.();
        const rect = chartElement?.getBoundingClientRect();
        if (!rect || !this._dragState) return;

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

        this.chart.timeScale().applyOptions({}); // Trigger repaint
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
        } else if (tool._p1 && tool._p2 && tool._p3 && (tool instanceof LongPosition || tool instanceof ShortPosition)) {
            // LongPosition/ShortPosition also has 3 points but handled differently in updatePointByIndex,
            // but for moving the whole shape, we move all 3 points.
            tool._p1.logical += deltaLogical;
            tool._p1.price += deltaPrice;
            tool._p2.logical += deltaLogical;
            tool._p2.price += deltaPrice;
            tool._p3.logical += deltaLogical;
            tool._p3.price += deltaPrice;
            tool.updateAllViews();
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
    }

    private _mouseDownHandler = (event: MouseEvent) => {
        this._lastMouseEvent = event;
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
            this._isDragging = false;
            this._dragState = null;
            this._setChartInteraction(true);
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

        const chartContainer = document.getElementById('container');
        if (!chartContainer) return;

        const rect = chartContainer.getBoundingClientRect();
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

        // CRITICAL FIX: Deselect after validation succeeds
        // This ensures that if a tool was just finished (and thus selected), it is immediately deselected
        // before the new tool starts drawing, but only after we know the point is valid.
        // MOVED TO startTool() to prevent race conditions

        // For tools that need LogicalPoints, use them directly instead of converting twice
        let pointToPush: LogicalPoint = { logical, price };
        if (this._activeToolType === 'Triangle' || this._activeToolType === 'TrendLine' || this._activeToolType === 'VerticalLine' || this._activeToolType === 'Rectangle' || this._activeToolType === 'Circle' || this._activeToolType === 'ParallelChannel' || this._activeToolType === 'FibRetracement' || this._activeToolType === 'Arrow' || this._activeToolType === 'Ray' || this._activeToolType === 'ExtendedLine' || this._activeToolType === 'HorizontalRay' || this._activeToolType === 'PriceRange' || this._activeToolType === 'LongPosition' || this._activeToolType === 'ShortPosition' || this._activeToolType === 'ElliottImpulseWave' || this._activeToolType === 'ElliottCorrectionWave' || this._activeToolType === 'DateRange' || this._activeToolType === 'FibExtension' || this._activeToolType === 'UserPriceAlerts') {
            // Already have the logical point, use it directly
            pointToPush = { logical, price };
        }

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
                // If no preview existed (shouldn't happen if move handler works), create one
                const tool = new HorizontalLine(this.chart, this.series, price, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(tool);
                this._addTool(tool, this._activeToolType);
                this.chart.timeScale().applyOptions({});
                this._selectTool(tool);
            }
            this._points = [];
        } else if (this._activeToolType === 'VerticalLine') {
            // Finalize the vertical line
            if (this._activeTool instanceof VerticalLine && logicalPoint) {
                this._activeTool.updatePosition(logicalPoint.logical as Logical);
                this._addTool(this._activeTool, this._activeToolType);
                const finishedTool = this._activeTool;
                this._activeTool = null;
                this.chart.timeScale().applyOptions({});
                this._selectTool(finishedTool);
            } else if (logicalPoint) {
                const tool = new VerticalLine(this.chart, this.series, logicalPoint.logical as Logical, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(tool);
                this._addTool(tool, this._activeToolType);
                this.chart.timeScale().applyOptions({});
                this._selectTool(tool);
            }
            this._points = [];
        } else if (this._activeToolType === 'Text') {
            if (!this._lastMouseEvent) return;

            const x = this._lastMouseEvent.clientX;
            const y = this._lastMouseEvent.clientY;

            const input = document.createElement('input');
            input.type = 'text';
            input.style.position = 'fixed';
            input.style.left = `${x}px`;
            input.style.top = `${y}px`;
            input.style.zIndex = '1000';
            input.style.border = '2px solid #2962ff';
            input.style.backgroundColor = 'white';
            input.style.padding = '4px 8px';
            input.style.fontFamily = 'Arial';
            input.style.fontSize = '14px';
            input.style.outline = 'none';
            input.style.color = '#000';

            document.body.appendChild(input);
            input.focus();

            let finished = false;
            const finish = () => {
                if (finished) return;
                finished = true;
                const text = input.value;
                if (text) {
                    const tool = new Text(this.chart, this.series, point, text, this.getToolOptions(this._activeToolType));
                    this.series.attachPrimitive(tool);
                    this._addTool(tool, 'Text');
                    this._selectTool(tool);
                }
                if (input.parentNode) {
                    input.parentNode.removeChild(input);
                }
                this._points = [];
            };

            input.addEventListener('blur', finish);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    finish();
                } else if (e.key === 'Escape') {
                    if (finished) return;
                    finished = true;
                    if (input.parentNode) {
                        input.parentNode.removeChild(input);
                    }
                    this._cancelActiveDrawing();
                }
            });
            this._points = [];
        } else if (this._activeToolType === 'ParallelChannel') {
            // Store LogicalPoints for ParallelChannel
            // Store LogicalPoints for ParallelChannel
            if (logicalPoint) {
                this._points[this._points.length - 1] = logicalPoint;
            }

            if (this._points.length === 1) {
                const p1 = this._points[0] as LogicalPoint;
                this._activeTool = new ParallelChannel(this.chart, this.series, p1, p1, p1, this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof ParallelChannel) {
                    const p2 = this._points[1] as LogicalPoint;
                    this._activeTool.updatePoints(this._activeTool._p1, p2, this._activeTool._p3);
                }
            } else if (this._points.length === 3) {
                if (this._activeTool instanceof ParallelChannel) {
                    const p3 = this._points[2] as LogicalPoint;
                    this._activeTool.updatePoints(this._activeTool._p1, this._activeTool._p2, p3);
                    const finishedTool = this._activeTool;
                    this._activeTool = null;
                    this._points = [];
                    this._selectTool(finishedTool);
                }
            }
        }
        // UserPriceAlerts handles its own mouse events through MouseHandlers
        // No need to intercept clicks here
        else if (this._activeToolType === 'FibRetracement') {
            // Store LogicalPoints for FibRetracement
            // Store LogicalPoints for FibRetracement
            if (logicalPoint) {
                this._points[this._points.length - 1] = logicalPoint;
            }

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
            // Store LogicalPoints for Triangle
            // Store LogicalPoints for Triangle
            if (logicalPoint) {
                this._points[this._points.length - 1] = logicalPoint;
            }

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
        } else if (this._activeToolType === 'Callout') {
            if (this._points.length === 1) {
                this._activeTool = new Callout(this.chart, this.series, point, point, 'Callout Text', this.getToolOptions(this._activeToolType));
                this.series.attachPrimitive(this._activeTool);
                this._addTool(this._activeTool, this._activeToolType);
            } else if (this._points.length === 2) {
                if (this._activeTool instanceof Callout) {
                    this._activeTool.updatePoints(this._points[0], this._points[1]);

                    // Show input box
                    if (!this._lastMouseEvent) return;

                    const x = this._lastMouseEvent.clientX;
                    const y = this._lastMouseEvent.clientY;

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.style.position = 'fixed';
                    input.style.left = `${x}px`;
                    input.style.top = `${y}px`;
                    input.style.zIndex = '1000';
                    input.style.border = '2px solid #2962ff';
                    input.style.backgroundColor = 'white';
                    input.style.padding = '4px 8px';
                    input.style.fontFamily = 'Arial';
                    input.style.fontSize = '12px';
                    input.style.outline = 'none';
                    input.style.color = '#000';
                    input.value = 'Callout Text'; // Default value

                    document.body.appendChild(input);
                    input.focus();
                    input.select(); // Select all text for easy replacement

                    let finished = false;
                    const finish = () => {
                        if (finished) return;
                        finished = true;
                        const text = input.value;
                        if (text && this._activeTool instanceof Callout) {
                            this._activeTool.updateText(text);
                            this.chart.timeScale().applyOptions({});
                        }
                        if (input.parentNode) {
                            input.parentNode.removeChild(input);
                        }
                        this._activeTool = null;
                        this._points = [];
                    };

                    input.addEventListener('blur', finish);
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            finish();
                        } else if (e.key === 'Escape') {
                            if (finished) return;
                            finished = true;
                            if (input.parentNode) {
                                input.parentNode.removeChild(input);
                            }
                            this._cancelActiveDrawing();
                        }
                    });
                }
            }
        } else if (this._activeToolType === 'LongPosition') {
            // Store LogicalPoints for LongPosition
            // Store LogicalPoints for LongPosition
            if (logicalPoint) {
                this._points[this._points.length - 1] = logicalPoint;
            }

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
        } else if (this._activeToolType === 'DateRange') {
            // Store LogicalPoints for DateRange
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

    private _addTool(tool: any, type: ToolType) {
        (tool as any).toolType = type;
        this._tools.push(tool);
    }

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

        // Skip for Brush/Highlighter/Rectangle/Circle (use raw mouse handler)
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
        } else if (this._activeToolType === 'Callout' && this._activeTool instanceof Callout) {
            this._activeTool.updatePoints(this._points[0], currentPoint);
            this.chart.timeScale().applyOptions({});
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
}
