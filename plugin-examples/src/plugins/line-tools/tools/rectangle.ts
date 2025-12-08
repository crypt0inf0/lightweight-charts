import { CanvasRenderingTarget2D } from 'fancy-canvas';
import {
    IChartApi,
    ISeriesApi,
    ISeriesPrimitive,
    IPrimitivePaneRenderer,
    IPrimitivePaneView,
    Logical,
    SeriesOptionsMap,
    SeriesType,
    Time,
} from 'lightweight-charts';
import {
    LogicalPoint,
    ViewPoint,
    HitTestResult,
    pointToCoordinate,
    isPointInRectangle,
    scaleCoordinate,
    drawAnchor,
    setLineStyle,
} from './base-types';
import { AutoscaleInfo } from 'lightweight-charts';

class RectanglePaneRenderer implements IPrimitivePaneRenderer {
    private readonly _p1: ViewPoint;
    private readonly _p2: ViewPoint;
    private readonly _options: RectangleOptions;
    private readonly _selected: boolean;

    constructor(
        p1: ViewPoint,
        p2: ViewPoint,
        options: RectangleOptions,
        selected: boolean
    ) {
        this._p1 = p1;
        this._p2 = p2;
        this._options = options;
        this._selected = selected;
    }

    draw(target: CanvasRenderingTarget2D): void {
        target.useBitmapCoordinateSpace(scope => {
            if (
                this._p1.x === null ||
                this._p1.y === null ||
                this._p2.x === null ||
                this._p2.y === null
            )
                return;

            const ctx = scope.context;

            const x1 = scaleCoordinate(this._p1.x, scope.horizontalPixelRatio);
            const y1 = scaleCoordinate(this._p1.y, scope.verticalPixelRatio);
            const x2 = scaleCoordinate(this._p2.x, scope.horizontalPixelRatio);
            const y2 = scaleCoordinate(this._p2.y, scope.verticalPixelRatio);

            const width = x2 - x1;
            const height = y2 - y1;

            // Draw rectangle
            ctx.lineWidth = this._options.width;
            ctx.strokeStyle = this._options.lineColor;
            ctx.lineWidth = this._options.width;
            ctx.strokeStyle = this._options.lineColor;
            ctx.fillStyle = this._options.backgroundColor;
            setLineStyle(ctx, this._options.lineStyle);

            ctx.beginPath();
            ctx.rect(x1, y1, width, height);
            ctx.fill();
            ctx.stroke();

            // Draw anchors when selected
            if (this._selected) {
                drawAnchor(scope, x1, y1);
                drawAnchor(scope, x2, y2);
                drawAnchor(scope, x1, y2);
                drawAnchor(scope, x2, y1);
            }
        });
    }
}

class RectanglePaneView implements IPrimitivePaneView {
    private readonly _source: Rectangle;
    private _p1: ViewPoint = { x: null, y: null };
    private _p2: ViewPoint = { x: null, y: null };

    constructor(source: Rectangle) {
        this._source = source;
    }

    update(): void {
        this._p1 = pointToCoordinate(
            this._source._p1,
            this._source._chart,
            this._source._series
        );
        this._p2 = pointToCoordinate(
            this._source._p2,
            this._source._chart,
            this._source._series
        );
    }

    renderer(): RectanglePaneRenderer {
        return new RectanglePaneRenderer(
            this._p1,
            this._p2,
            this._source._options,
            this._source._selected
        );
    }
}

export interface RectangleOptions {
    lineColor: string;
    width: number;
    backgroundColor: string;
    lineStyle: number;
    locked?: boolean;
}

const defaultOptions: RectangleOptions = {
    lineColor: 'rgb(41, 98, 255)',
    width: 2,
    backgroundColor: 'rgba(41, 98, 255, 0.2)',
    lineStyle: 0,
    locked: false,
};

export class Rectangle implements ISeriesPrimitive<Time> {
    readonly _chart: IChartApi;
    readonly _series: ISeriesApi<keyof SeriesOptionsMap>;
    _p1: LogicalPoint;
    _p2: LogicalPoint;
    private readonly _paneViews: RectanglePaneView[];
    readonly _options: RectangleOptions;
    _selected: boolean = false;
    _locked: boolean = false;

    constructor(
        chart: IChartApi,
        series: ISeriesApi<SeriesType>,
        p1: LogicalPoint,
        p2: LogicalPoint,
        options?: Partial<RectangleOptions>
    ) {
        this._chart = chart;
        this._series = series;
        this._p1 = p1;
        this._p2 = p2;
        this._options = {
            ...defaultOptions,
            ...options,
        };
        this._paneViews = [new RectanglePaneView(this)];
    }

    /**
     * Update both anchor points of the rectangle
     */
    public updatePoints(p1: LogicalPoint, p2: LogicalPoint): void {
        this._p1 = p1;
        this._p2 = p2;
        this.updateAllViews();
    }

    /**
     * Update a single anchor point by index
     * @param index - 0 for p1, 1 for p2
     * @param point - New logical point
     */
    public updatePointByIndex(index: number, point: LogicalPoint): void {
        if (index === 0) {
            this._p1 = point;
        } else if (index === 1) {
            this._p2 = point;
        } else if (index === 2) {
            // Top-right corner (x2, y1) -> updates x2 and y1
            this._p2 = { ...this._p2, logical: point.logical };
            this._p1 = { ...this._p1, price: point.price };
        } else if (index === 3) {
            // Bottom-left corner (x1, y2) -> updates x1 and y2
            this._p1 = { ...this._p1, logical: point.logical };
            this._p2 = { ...this._p2, price: point.price };
        }
        this.updateAllViews();
    }

    /**
     * Set selection state and update visuals
     */
    public setSelected(selected: boolean): void {
        this._selected = selected;
        this.updateAllViews();
    }

    public applyOptions(options: Partial<RectangleOptions>): void {
        Object.assign(this._options, options);
        this.updateAllViews();
        this._chart.timeScale().applyOptions({});
    }

    /**
     * Hit test to detect clicks on anchors or inside rectangle
     * @param x - Screen x coordinate
     * @param y - Screen y coordinate
     * @returns Hit test result indicating what was clicked
     */
    public toolHitTest(x: number, y: number): HitTestResult | null {
        const timeScale = this._chart.timeScale();
        const series = this._series;

        const x1 = timeScale.logicalToCoordinate(this._p1.logical as Logical);
        const y1 = series.priceToCoordinate(this._p1.price);
        const x2 = timeScale.logicalToCoordinate(this._p2.logical as Logical);
        const y2 = series.priceToCoordinate(this._p2.price);

        if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

        // Check anchor points first (higher priority)
        const threshold = 8;
        // Top-left (p1)
        if (Math.hypot(x - x1, y - y1) < threshold) {
            return { hit: true, type: 'point', index: 0 };
        }
        // Bottom-right (p2)
        if (Math.hypot(x - x2, y - y2) < threshold) {
            return { hit: true, type: 'point', index: 1 };
        }
        // Top-right (x2, y1)
        if (Math.hypot(x - x2, y - y1) < threshold) {
            return { hit: true, type: 'point', index: 2 };
        }
        // Bottom-left (x1, y2)
        if (Math.hypot(x - x1, y - y2) < threshold) {
            return { hit: true, type: 'point', index: 3 };
        }

        // Check if inside rectangle
        if (isPointInRectangle({ x, y }, { x1, y1, x2, y2 })) {
            return { hit: true, type: 'shape' };
        }

        return null;
    }

    autoscaleInfo(): AutoscaleInfo | null {
        return null;
    }

    updateAllViews(): void {
        this._paneViews.forEach(pw => pw.update());
    }

    paneViews(): RectanglePaneView[] {
        return this._paneViews;
    }
}
