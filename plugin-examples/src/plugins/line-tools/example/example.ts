import { CandlestickSeries, ColorType, createChart } from 'lightweight-charts';
import { generateCandleData } from '../../../sample-data';
import { LineToolManager } from '../line-tool-manager';

const chart = createChart(document.getElementById('container') as HTMLElement, {
    layout: {
        textColor: 'black',
        background: { type: ColorType.Solid, color: 'white' },
    },
    crosshair: {
        mode: 0, // Normal mode (no magnet to candles)
    },
});

const series = chart.addSeries(CandlestickSeries);
const data = generateCandleData();
series.setData(data);

const manager = new LineToolManager();
series.attachPrimitive(manager);

const btnNone = document.getElementById('btn-none') as HTMLButtonElement;
const btnTrendLine = document.getElementById('btn-trend-line') as HTMLButtonElement;
const btnHorizontalLine = document.getElementById('btn-horizontal-line') as HTMLButtonElement;
const btnVerticalLine = document.getElementById('btn-vertical-line') as HTMLButtonElement;
const btnRectangle = document.getElementById('btn-rectangle') as HTMLButtonElement;
const btnPriceRange = document.getElementById('btn-price-range') as HTMLButtonElement;
const btnText = document.getElementById('btn-text') as HTMLButtonElement;
const btnParallelChannel = document.getElementById('btn-parallel-channel') as HTMLButtonElement;
const btnFibRetracement = document.getElementById('btn-fib-retracement') as HTMLButtonElement;
const btnTriangle = document.getElementById('btn-triangle') as HTMLButtonElement;
const btnBrush = document.getElementById('btn-brush') as HTMLButtonElement;
const btnHighlighter = document.getElementById('btn-highlighter') as HTMLButtonElement;
const btnPath = document.getElementById('btn-path') as HTMLButtonElement;
const btnCallout = document.getElementById('btn-callout') as HTMLButtonElement;
const btnCrossLine = document.getElementById('btn-cross-line') as HTMLButtonElement;
const btnCircle = document.getElementById('btn-circle') as HTMLButtonElement;
const btnArrow = document.getElementById('btn-arrow') as HTMLButtonElement;
const btnRay = document.getElementById('btn-ray') as HTMLButtonElement;
const btnExtendedLine = document.getElementById('btn-extended-line') as HTMLButtonElement;
const btnHorizontalRay = document.getElementById('btn-horizontal-ray') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const btnUserPriceAlerts = document.getElementById('btn-user-price-alerts') as HTMLButtonElement;

function setActiveButton(button: HTMLButtonElement) {
    document.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    button.classList.add('active');
}

btnNone.addEventListener('click', () => {
    manager.startTool('None');
    setActiveButton(btnNone);
});

btnTrendLine.addEventListener('click', () => {
    manager.startTool('TrendLine');
    setActiveButton(btnTrendLine);
});

btnArrow.addEventListener('click', () => {
    manager.startTool('Arrow');
    setActiveButton(btnArrow);
});

btnRay.addEventListener('click', () => {
    manager.startTool('Ray');
    setActiveButton(btnRay);
});

btnExtendedLine.addEventListener('click', () => {
    manager.startTool('ExtendedLine');
    setActiveButton(btnExtendedLine);
});

btnHorizontalRay.addEventListener('click', () => {
    manager.startTool('HorizontalRay');
    setActiveButton(btnHorizontalRay);
});

btnHorizontalLine.addEventListener('click', () => {
    manager.startTool('HorizontalLine');
    setActiveButton(btnHorizontalLine);
});

btnVerticalLine.addEventListener('click', () => {
    manager.startTool('VerticalLine');
    setActiveButton(btnVerticalLine);
});

btnRectangle.addEventListener('click', () => {
    manager.startTool('Rectangle');
    setActiveButton(btnRectangle);
});

btnPriceRange.addEventListener('click', () => {
    manager.startTool('PriceRange');
    setActiveButton(btnPriceRange);
});

btnText.addEventListener('click', () => {
    manager.startTool('Text');
    setActiveButton(btnText);
});

btnParallelChannel.addEventListener('click', () => {
    manager.startTool('ParallelChannel');
    setActiveButton(btnParallelChannel);
});

btnFibRetracement.addEventListener('click', () => {
    manager.startTool('FibRetracement');
    setActiveButton(btnFibRetracement);
});

const btnLongPosition = document.getElementById('btn-long-position') as HTMLButtonElement;
btnLongPosition.addEventListener('click', () => {
    manager.startTool('LongPosition');
    setActiveButton(btnLongPosition);
});

const btnShortPosition = document.getElementById('btn-short-position') as HTMLButtonElement;
btnShortPosition.addEventListener('click', () => {
    manager.startTool('ShortPosition');
    setActiveButton(btnShortPosition);
});

const btnElliottImpulseWave = document.getElementById('btn-elliott-impulse-wave') as HTMLButtonElement;
btnElliottImpulseWave.addEventListener('click', () => {
    manager.startTool('ElliottImpulseWave');
    setActiveButton(btnElliottImpulseWave);
});

const btnElliottCorrectionWave = document.getElementById('btn-elliott-correction-wave') as HTMLButtonElement;
btnElliottCorrectionWave.addEventListener('click', () => {
    manager.startTool('ElliottCorrectionWave');
    setActiveButton(btnElliottCorrectionWave);
});

const btnDateRange = document.getElementById('btn-date-range') as HTMLButtonElement;
btnDateRange.addEventListener('click', () => {
    manager.startTool('DateRange');
    setActiveButton(btnDateRange);
});

const btnFibExtension = document.getElementById('btn-fib-extension') as HTMLButtonElement;
btnFibExtension.addEventListener('click', () => {
    manager.startTool('FibExtension');
    setActiveButton(btnFibExtension);
});

const btnDatePriceRange = document.getElementById('btn-date-price-range') as HTMLButtonElement;
btnDatePriceRange.addEventListener('click', () => {
    manager.startTool('DatePriceRange');
    setActiveButton(btnDatePriceRange);
});

const btnMeasure = document.getElementById('btn-measure') as HTMLButtonElement;
btnMeasure.addEventListener('click', () => {
    manager.startTool('Measure');
    setActiveButton(btnMeasure);
});

const btnHeadAndShoulders = document.getElementById('btn-head-and-shoulders') as HTMLButtonElement;
btnHeadAndShoulders.addEventListener('click', () => {
    manager.startTool('HeadAndShoulders');
    setActiveButton(btnHeadAndShoulders);
});

btnTriangle.addEventListener('click', () => {
    manager.startTool('Triangle');
    setActiveButton(btnTriangle);
});

const btnSession = document.getElementById('btn-session') as HTMLButtonElement;
if (btnSession) {
    btnSession.addEventListener('click', () => {
        const sessionHighlighter = (time: any) => {
            const date = new Date(time * 1000);
            const dayOfWeek = date.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                return 'rgba(255, 152, 1, 0.08)';
            }
            return 'rgba(41, 98, 255, 0.08)';
        };
        manager.enableSessionHighlighting(sessionHighlighter);
    });
}



btnBrush.addEventListener('click', () => {
    manager.startTool('Brush');
    setActiveButton(btnBrush);
});

btnHighlighter.addEventListener('click', () => {
    manager.startTool('Highlighter');
    setActiveButton(btnHighlighter);
});

btnPath.addEventListener('click', () => {
    manager.startTool('Path');
    setActiveButton(btnPath);
});

btnCallout.addEventListener('click', () => {
    manager.startTool('Callout');
    setActiveButton(btnCallout);
});

btnUserPriceAlerts.addEventListener('click', () => {
    manager.startTool('UserPriceAlerts');
    setActiveButton(btnUserPriceAlerts);
});

const btnPriceLabel = document.getElementById('btn-price-label') as HTMLButtonElement;
btnPriceLabel.addEventListener('click', () => {
    manager.startTool('PriceLabel');
    setActiveButton(btnPriceLabel);
});

btnCrossLine.addEventListener('click', () => {
    manager.startTool('CrossLine');
    setActiveButton(btnCrossLine);
});

btnCircle.addEventListener('click', () => {
    manager.startTool('Circle');
    setActiveButton(btnCircle);
});

const btnEraser = document.getElementById('btn-eraser') as HTMLButtonElement;
btnEraser.addEventListener('click', () => {
    manager.startTool('Eraser');
    setActiveButton(btnEraser);
});

btnClear.addEventListener('click', () => {
    manager.clearTools();
});
