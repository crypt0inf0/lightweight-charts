import { LineToolManager } from './line-tool-manager';
import { TemplateManager } from './template-manager';
import './floating-toolbar.css';

export class FloatingToolbar {
    private _container: HTMLElement;
    private _manager: LineToolManager;
    private _activeTool: any | null = null;
    private _savedPosition: { x: number, y: number } | null = null;

    // Icons matching the "thin stroke" style of the provided images
    private static readonly ICONS = {
        // 6-dot grid handle (Standard TV style)
        drag: '<svg width="24" height="24" viewBox="0 0 24 24" fill="#BFBFBF"> <circle cx="9" cy="7"  r="1.6"/> <circle cx="15" cy="7"  r="1.6"/> <circle cx="9" cy="12" r="1.6"/> <circle cx="15" cy="12" r="1.6"/> <circle cx="9" cy="17" r="1.6"/> <circle cx="15" cy="17" r="1.6"/> </svg>',
        // Templates (Grid Layout)
        template: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"> <!-- Top Left --> <rect x="3.5" y="3.5" width="7" height="7" rx="2"/> <!-- Top Right --> <rect x="13.5" y="3.5" width="7" height="7" rx="2"/> <!-- Bottom Left --> <rect x="3.5" y="13.5" width="7" height="7" rx="2"/> <!-- Plus Symbol (replaces bottom-right square) --> <line x1="17" y1="14.5" x2="17" y2="20.5"/> <line x1="14.5" y1="17.5" x2="19.5" y2="17.5"/> </svg>',
        // Pencil (Line Color)
        brush: '<svg viewBox="0 0 24 24"><path d="M14.06 9.02l.92.92L5.92 19H5v-.92l9.06-9.06M17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29zm-3.6 3.19L3 17.25V21h3.75L17.81 9.94l-3.75-3.75z"/></svg>',
        // Text 'T'
        text: '<svg viewBox="0 0 24 24"><path d="M5 4v3h5.5v12h3V7H19V4z"/></svg>',
        // Paint Bucket (Fill)
        fill: '<svg viewBox="0 0 24 24"><path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.59-.59 1.54 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10L10 5.21 14.79 10H5.21zM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z"/><path d="M0 20h24v4H0z"/></svg>',
        // Settings (Gear) - Sleek
        settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>',
        // Alert (Stopwatch +)
        alert: '<svg viewBox="0 0 24 24"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.5"/><path d="M9 2h6" stroke="currentColor" stroke-width="1.5"/></svg>',
        // Lock
        lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" fill="none" stroke-width="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>',
        // Trash
        delete: '<svg viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" fill="none" stroke-width="1.5"/></svg>',
        // More
        more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/><circle cx="5" cy="12" r="1.5" fill="currentColor"/></svg>'
    };

    constructor(manager: LineToolManager) {
        this._manager = manager;
        this._container = document.createElement('div');
        this._container.className = 'tv-floating-toolbar hidden';
        document.body.appendChild(this._container);
    }

    public showCollapsed(toolType: string) {
        this._renderCollapsed(toolType);
        this._positionToolbar();
    }

    public showExpanded(tool: any) {
        this._activeTool = tool;
        this._renderExpanded(tool);
        this._positionToolbar();
    }

    public hide() {
        this._container.classList.add('hidden');
        this._closeAllDropdowns();
    }

    private _positionToolbar() {
        if (this._savedPosition) {
            this._show(this._savedPosition.x, this._savedPosition.y);
        } else {
            const chartRect = this._manager.getChartRect();
            const toolbarRect = this._container.getBoundingClientRect();

            if (chartRect) {
                // Default: 15px from top, 30px from right inside the chart
                // Note: We need to use client coordinates (relative to viewport) because position is fixed/absolute
                const initialX = chartRect.right - toolbarRect.width - 100;
                const initialY = chartRect.top + 15;
                this._show(initialX, initialY);
            } else {
                // Fallback if chart rect is not available
                const initialX = window.innerWidth - toolbarRect.width - 100;
                const initialY = 100;
                this._show(initialX, initialY);
            }
        }
    }

    public updatePosition(x: number, y: number) {
        if (this._container.classList.contains('hidden')) return;

        const rect = this._container.getBoundingClientRect();
        const chartRect = this._manager.getChartRect();

        let minX = 10;
        let minY = 10;
        let maxX = window.innerWidth - rect.width - 10;
        let maxY = window.innerHeight - rect.height - 10;

        if (chartRect) {
            minX = chartRect.left;
            minY = chartRect.top;
            maxX = chartRect.right - rect.width;
            maxY = chartRect.bottom - rect.height;
        }

        const finalX = Math.min(Math.max(minX, x), maxX);
        const finalY = Math.min(Math.max(minY, y), maxY);

        this._container.style.left = `${finalX}px`;
        this._container.style.top = `${finalY}px`;
    }

    private _show(x: number, y: number) {
        this._container.classList.remove('hidden');
        this.updatePosition(x, y);
    }

    private _renderCollapsed(toolType: string) {
        this._container.innerHTML = '';
        this._container.dataset.tool = toolType;
        this._container.appendChild(this._createDragHandle());

        let icon = FloatingToolbar.ICONS.brush;
        if (toolType === 'Text') icon = FloatingToolbar.ICONS.text;
        if (toolType === 'UserPriceAlerts') icon = FloatingToolbar.ICONS.alert;

        const toolBtn = this._createButton(icon, toolType);
        toolBtn.classList.add('active');
        this._container.appendChild(toolBtn);
    }

    private _renderExpanded(tool: any) {
        this._container.innerHTML = '';

        // 1. Drag Handle
        this._container.appendChild(this._createDragHandle());

        // 2. Templates (Template Icon)
        const templateWrapper = this._createToolWrapper();
        const templateBtn = this._createButton(FloatingToolbar.ICONS.template, 'Templates');
        templateBtn.addEventListener('click', (e) => this._toggleDropdown(e, templateWrapper, (container) => this._createTemplateList(container, tool)));
        templateWrapper.appendChild(templateBtn);
        this._container.appendChild(templateWrapper);

        const options = tool._options || {};

        // 3. Line Color (Pencil)
        const lineColorWrapper = this._createToolWrapper();
        const lineColorBtn = this._createButton(FloatingToolbar.ICONS.brush, 'Line Color');

        // Active state style
        const activeLineColor = options.lineColor || options.borderColor || options.color || '#2962ff';
        lineColorBtn.classList.add('active');
        lineColorBtn.style.setProperty('--active-color', activeLineColor);

        lineColorBtn.addEventListener('click', (e) => this._toggleDropdown(e, lineColorWrapper, (container) => this._createColorGrid(container, tool, 'line', lineColorBtn)));
        lineColorWrapper.appendChild(lineColorBtn);
        this._container.appendChild(lineColorWrapper);

        // 4. Fill Color (Bucket) - Only if tool supports background
        if (options.backgroundColor !== undefined) {
            const fillColorWrapper = this._createToolWrapper();
            const fillColorBtn = this._createButton(FloatingToolbar.ICONS.fill, 'Fill Color');

            const activeFillColor = options.backgroundColor;
            fillColorBtn.classList.add('active');
            fillColorBtn.style.setProperty('--active-color', activeFillColor);

            fillColorBtn.addEventListener('click', (e) => this._toggleDropdown(e, fillColorWrapper, (container) => this._createColorGrid(container, tool, 'fill', fillColorBtn)));
            fillColorWrapper.appendChild(fillColorBtn);
            this._container.appendChild(fillColorWrapper);
        }

        // 5. Text Tool Icon (if applicable)
        if (tool.toolType === 'Text') {
            const textBtn = this._createButton(FloatingToolbar.ICONS.text, 'Text');
            textBtn.classList.add('active');
            this._container.appendChild(textBtn);
        }

        this._addSeparator();

        // 6. Stroke Width (Line + Text)
        if (options.lineWidth !== undefined || options.width !== undefined) {
            const widthWrapper = this._createToolWrapper();

            // Custom Trigger: Line Preview + Text
            const widthTrigger = document.createElement('div');
            widthTrigger.className = 'stroke-width-trigger';
            widthTrigger.title = 'Line Width';

            const currentWidth = options.lineWidth || options.width || 1;

            const linePreview = document.createElement('div');
            linePreview.className = 'stroke-width-preview';
            linePreview.style.height = `${Math.max(1, currentWidth)}px`;

            const label = document.createElement('span');
            label.textContent = `${currentWidth}px`;

            widthTrigger.appendChild(linePreview);
            widthTrigger.appendChild(label);

            widthTrigger.addEventListener('click', (e) => this._toggleDropdown(e, widthWrapper, (container) => this._createWidthList(container, tool, linePreview, label)));

            widthWrapper.appendChild(widthTrigger);
            this._container.appendChild(widthWrapper);
        }

        this._addSeparator();

        // 7. Settings
        this._container.appendChild(this._createButton(FloatingToolbar.ICONS.settings, 'Settings'));

        // 8. Alert
        this._container.appendChild(this._createButton(FloatingToolbar.ICONS.alert, 'Add Alert'));

        // 9. Lock
        this._container.appendChild(this._createButton(FloatingToolbar.ICONS.lock, 'Lock'));

        // 10. Delete
        const deleteBtn = this._createButton(FloatingToolbar.ICONS.delete, 'Remove');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (this._activeTool) this._manager.deleteTool(this._activeTool);
        });
        this._container.appendChild(deleteBtn);

        // 11. More
        this._container.appendChild(this._createButton(FloatingToolbar.ICONS.more, 'More'));
    }

    private _createDragHandle(): HTMLElement {
        const dragHandle = document.createElement('div');
        dragHandle.className = 'drag-handle';
        dragHandle.innerHTML = FloatingToolbar.ICONS.drag;
        dragHandle.addEventListener('mousedown', (e) => this._startDrag(e as any));
        return dragHandle;
    }

    private _createToolWrapper(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'tool-wrapper';
        return wrapper;
    }

    private _createButton(iconHtml: string, title: string): HTMLElement {
        const btn = document.createElement('button');
        btn.className = 'tool-btn';
        btn.innerHTML = iconHtml;
        btn.title = title;
        return btn;
    }

    private _addSeparator() {
        const sep = document.createElement('div');
        sep.className = 'divider';
        this._container.appendChild(sep);
    }

    private _toggleDropdown(e: Event, wrapper: HTMLElement, renderContent: (container: HTMLElement) => void) {
        e.stopPropagation();

        const existingDropdown = wrapper.querySelector('.tv-floating-toolbar__dropdown');
        if (existingDropdown && existingDropdown.classList.contains('visible')) {
            existingDropdown.classList.remove('visible');
            return;
        }

        this._closeAllDropdowns();

        let dropdown = wrapper.querySelector('.tv-floating-toolbar__dropdown') as HTMLElement;
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'tv-floating-toolbar__dropdown';
            wrapper.appendChild(dropdown);
        }

        dropdown.innerHTML = '';
        renderContent(dropdown);

        requestAnimationFrame(() => dropdown.classList.add('visible'));

        const closeHandler = () => {
            dropdown.classList.remove('visible');
            document.removeEventListener('click', closeHandler);
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
        dropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    private _closeAllDropdowns() {
        const open = this._container.querySelectorAll('.tv-floating-toolbar__dropdown.visible');
        open.forEach(el => el.classList.remove('visible'));
    }

    // --- Content Generators ---

    private _createWidthList(container: HTMLElement, tool: any, previewLine: HTMLElement, previewLabel: HTMLElement) {
        const widths = [1, 2, 3, 4];
        const currentWidth = (tool._options?.lineWidth || tool._options?.width || 1);

        widths.forEach(width => {
            const item = document.createElement('div');
            item.className = 'tv-width-picker__item';
            if (width === currentWidth) item.classList.add('active');

            item.innerHTML = `
                <div class="tv-width-picker__line" style="height: ${width}px"></div>
                <div class="tv-width-picker__text">${width}px</div>
            `;

            item.addEventListener('click', () => {
                this._applyWidth(tool, width);
                previewLine.style.height = `${width}px`;
                previewLabel.textContent = `${width}px`;
                container.classList.remove('visible');
            });
            container.appendChild(item);
        });
    }

    private _createTemplateList(container: HTMLElement, tool: any) {
        const saveItem = document.createElement('div');
        saveItem.className = 'tv-template-item';
        saveItem.innerHTML = `<span>Save Drawing Template As...</span>`;
        saveItem.addEventListener('click', () => {
            this._saveTemplate(tool);
            container.classList.remove('visible');
        });
        container.appendChild(saveItem);

        const defaultItem = document.createElement('div');
        defaultItem.className = 'tv-template-item';
        defaultItem.innerHTML = `<span>Apply Default Drawing Template</span>`;
        container.appendChild(defaultItem);

        const templates = TemplateManager.loadTemplates();
        if (templates.length > 0) {
            const sep = document.createElement('div');
            sep.className = 'tv-dropdown-separator';
            container.appendChild(sep);

            templates.forEach(template => {
                const item = document.createElement('div');
                item.className = 'tv-template-item';
                item.innerHTML = `
                    <span class="tv-template-item__name">${this._escapeHtml(template.name)}</span>
                    <button class="tv-template-item__delete" title="Delete template">×</button>
                `;

                item.querySelector('.tv-template-item__name')?.addEventListener('click', () => {
                    if (TemplateManager.applyTemplate(template.id, tool)) {
                        this._renderExpanded(tool);
                    }
                });

                item.querySelector('.tv-template-item__delete')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (TemplateManager.deleteTemplate(template.id)) {
                        container.innerHTML = '';
                        this._createTemplateList(container, tool);
                    }
                });

                container.appendChild(item);
            });
        }
    }

    private _createColorGrid(container: HTMLElement, tool: any, context: 'line' | 'fill', triggerBtn: HTMLElement) {
        const colors = [
            '#ffffff', '#e1e1e1', '#b2b5be', '#787b86', '#5d606b', '#434651', '#2a2e39', '#131722',
            '#f23645', '#ff9800', '#ffe600', '#4caf50', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0',
            '#ef9a9a', '#ffe0b2', '#fff9c4', '#c8e6c9', '#b2ebf2', '#bbdefb', '#d1c4e9', '#e1bee7',
            '#e57373', '#ffcc80', '#fff59d', '#a5d6a7', '#80deea', '#90caf9', '#b39ddb', '#ce93d8',
            '#ef5350', '#ffb74d', '#fff176', '#81c784', '#4dd0e1', '#64b5f6', '#9575cd', '#ba68c8',
            '#e53935', '#ffa726', '#ffee58', '#66bb6a', '#26c6da', '#42a5f5', '#7e57c2', '#ab47bc',
            '#d32f2f', '#fb8c00', '#fdd835', '#43a047', '#00acc1', '#1e88e5', '#5e35b1', '#8e24aa',
            '#c62828', '#f57c00', '#fbc02d', '#388e3c', '#0097a7', '#1976d2', '#512da8', '#7b1fa2'
        ];

        const grid = document.createElement('div');
        grid.className = 'tv-color-picker__grid';

        const currentOptions = tool._options || {};
        let currentColor = context === 'line'
            ? (currentOptions.lineColor || currentOptions.borderColor || currentOptions.color || '#2962ff')
            : (currentOptions.backgroundColor || '#2962ff');

        colors.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'tv-color-picker__swatch';
            swatch.style.backgroundColor = color;
            if (currentColor.toLowerCase().startsWith(color.toLowerCase())) {
                swatch.classList.add('active');
            }

            swatch.addEventListener('click', () => {
                this._applyColor(tool, color, context);
                triggerBtn.style.setProperty('--active-color', color);
                this._updateOpacitySlider(container, color);
            });
            grid.appendChild(swatch);
        });

        container.appendChild(grid);

        const sep = document.createElement('div');
        sep.className = 'tv-dropdown-separator';
        container.appendChild(sep);

        const customBtn = document.createElement('div');
        customBtn.className = 'tv-color-picker__custom-btn';
        customBtn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>`;

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'tv-color-picker__input';
        colorInput.addEventListener('input', (e: any) => {
            this._applyColor(tool, e.target.value, context);
            triggerBtn.style.setProperty('--active-color', e.target.value);
            this._updateOpacitySlider(container, e.target.value);
        });

        customBtn.appendChild(colorInput);
        container.appendChild(customBtn);

        this._renderOpacitySlider(container, tool, context);
    }

    private _renderOpacitySlider(container: HTMLElement, tool: any, context: 'line' | 'fill') {
        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'tv-opacity-slider';

        const label = document.createElement('div');
        label.className = 'tv-opacity-slider__label';
        label.textContent = 'Opacity';
        sliderContainer.appendChild(label);

        const controls = document.createElement('div');
        controls.className = 'tv-opacity-slider__controls';

        const track = document.createElement('div');
        track.className = 'tv-opacity-slider__track';

        const thumb = document.createElement('div');
        thumb.className = 'tv-opacity-slider__thumb';

        track.appendChild(thumb);
        controls.appendChild(track);

        const valueDisplay = document.createElement('div');
        valueDisplay.className = 'tv-opacity-slider__value';
        controls.appendChild(valueDisplay);

        sliderContainer.appendChild(controls);
        container.appendChild(sliderContainer);

        const options = tool._options || {};
        let currentColor = context === 'line'
            ? (options.lineColor || options.borderColor || options.color || '#2962ff')
            : (options.backgroundColor || '#2962ff');

        let currentOpacity = 1.0;
        if (currentColor.startsWith('rgba')) {
            const match = currentColor.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)/);
            if (match) currentOpacity = parseFloat(match[1]);
        }

        const initialPercent = Math.round(currentOpacity * 100);
        thumb.style.left = `${initialPercent}%`;
        valueDisplay.innerText = `${initialPercent}%`;

        // Updated logic removing the unused 'isDragging' variable
        const updateOpacity = (clientX: number) => {
            const rect = track.getBoundingClientRect();
            let x = clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            const percent = Math.round((x / rect.width) * 100);

            thumb.style.left = `${percent}%`;
            valueDisplay.innerText = `${percent}%`;

            this._applyOpacity(tool, percent / 100, context);
        };

        track.addEventListener('mousedown', (e) => {
            updateOpacity(e.clientX);
            const move = (e: MouseEvent) => updateOpacity(e.clientX);
            const up = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
            e.preventDefault();
        });
    }

    private _updateOpacitySlider(container: HTMLElement, color: string) {
        const track = container.querySelector('.tv-opacity-slider__track') as HTMLElement;
        if (track) track.style.background = `linear-gradient(to right, #E0E3EB 0%, ${color} 100%)`;
    }

    private _applyOpacity(tool: any, alpha: number, context: 'line' | 'fill') {
        const options = tool._options || {};
        let color = context === 'line'
            ? (options.lineColor || options.borderColor || options.color || '#2962ff')
            : (options.backgroundColor || '#2962ff');

        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            color = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        } else if (color.startsWith('rgb')) {
            color = color.replace(/[\d\.]+\)$/g, `${alpha})`);
        }

        this._applyColor(tool, color, context);
    }

    private _applyColor(tool: any, color: string, context: 'line' | 'fill') {
        const options = tool._options || {};
        let currentColor = context === 'line'
            ? (options.lineColor || options.borderColor || options.color || '#2962ff')
            : (options.backgroundColor || '#2962ff');

        if (!color.startsWith('rgba')) {
            let currentOpacity = 1.0;
            if (currentColor.startsWith('rgba')) {
                const match = currentColor.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)/);
                if (match) currentOpacity = parseFloat(match[1]);
            }
            if (currentOpacity < 1.0 && color.startsWith('#')) {
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                color = `rgba(${r}, ${g}, ${b}, ${currentOpacity})`;
            }
        }

        const updates: any = {};
        if (context === 'line') {
            if (options.lineColor !== undefined) updates.lineColor = color;
            if (options.borderColor !== undefined) updates.borderColor = color;
            if (options.color !== undefined) updates.color = color;
            if (options.textColor !== undefined && options.backgroundColor === undefined) updates.textColor = color;
        } else {
            if (options.backgroundColor !== undefined) updates.backgroundColor = color;
        }

        tool.applyOptions(updates);
        const type = (tool as any).toolType || tool.constructor.name;
        this._manager.updateToolOptions(type as any, updates);
    }

    private _applyWidth(tool: any, width: number) {
        const updates: any = {};
        if (tool._options?.lineWidth !== undefined) updates.lineWidth = width;
        if (tool._options?.width !== undefined) updates.width = width;
        tool.applyOptions(updates);
        const type = (tool as any).toolType || tool.constructor.name;
        this._manager.updateToolOptions(type as any, updates);
    }

    private _saveTemplate(tool: any) {
        const name = prompt('Enter template name:');
        if (!name) return;
        const styles = TemplateManager.extractStyles(tool);
        TemplateManager.saveTemplate(name, styles);
    }

    private _escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    private _startDrag(e: MouseEvent) {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = this._container.getBoundingClientRect();
        const startLeft = rect.left;
        const startTop = rect.top;

        const onMouseMove = (e: MouseEvent) => {
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;

            const chartRect = this._manager.getChartRect();
            let minLeft = 0;
            let minTop = 0;
            let maxLeft = window.innerWidth - rect.width;
            let maxTop = window.innerHeight - rect.height;

            if (chartRect) {
                minLeft = chartRect.left;
                minTop = chartRect.top;
                maxLeft = chartRect.right - rect.width;
                maxTop = chartRect.bottom - rect.height;
            }

            newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
            newTop = Math.max(minTop, Math.min(newTop, maxTop));

            this._container.style.left = `${newLeft}px`;
            this._container.style.top = `${newTop}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            const rect = this._container.getBoundingClientRect();
            this._savedPosition = { x: rect.left, y: rect.top };
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}
