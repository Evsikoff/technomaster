/**
 * Game Field Renderer Module for Technomaster
 * Модуль отрисовки игрового поля 4x4
 */

class GameFieldRenderer {
    constructor() {
        // Размеры ячейки соответствуют соотношению карты 5:7 (200x280)
        this.cellWidth = 200;
        this.cellHeight = 280;
        this.gridSize = 4;
        this.cellGap = 10;
    }

    /**
     * Генерация случайного числа от min до max включительно
     * @param {number} min - Минимальное значение
     * @param {number} max - Максимальное значение
     * @returns {number} - Случайное число
     */
    getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Получение случайных уникальных индексов ячеек
     * @param {number} count - Количество индексов
     * @param {number} totalCells - Общее количество ячеек
     * @returns {Set<number>} - Множество уникальных индексов
     */
    getRandomUniqueIndices(count, totalCells) {
        const indices = new Set();
        while (indices.size < count) {
            indices.add(this.getRandomInt(0, totalCells - 1));
        }
        return indices;
    }

    /**
     * Главная функция отрисовки игрового поля
     *
     * @param {Object} options - Опции отрисовки (опционально)
     * @param {number} options.unavailableCount - Фиксированное количество недоступных ячеек (если не указано - случайное 0-6)
     * @param {Array<number>} options.unavailableCells - Фиксированные индексы недоступных ячеек (0-15)
     * @param {number} options.cellWidth - Ширина ячейки (по умолчанию 200)
     * @param {number} options.cellHeight - Высота ячейки (по умолчанию 280)
     * @param {number} options.cellGap - Отступ между ячейками (по умолчанию 10)
     *
     * @returns {Object} - Объект с DOM-элементом поля и метаданными
     */
    renderField(options = {}) {
        const {
            unavailableCount = null,
            unavailableCells = null,
            cellWidth = this.cellWidth,
            cellHeight = this.cellHeight,
            cellGap = this.cellGap
        } = options;

        const totalCells = this.gridSize * this.gridSize; // 16 ячеек

        // Определяем количество недоступных ячеек
        let numUnavailable;
        if (unavailableCount !== null) {
            numUnavailable = Math.min(Math.max(0, unavailableCount), 6);
        } else {
            numUnavailable = this.getRandomInt(0, 6);
        }

        // Определяем какие ячейки недоступны
        let unavailableIndices;
        if (unavailableCells !== null && Array.isArray(unavailableCells)) {
            unavailableIndices = new Set(unavailableCells.slice(0, numUnavailable));
        } else {
            unavailableIndices = this.getRandomUniqueIndices(numUnavailable, totalCells);
        }

        // Создаем контейнер поля
        const fieldElement = document.createElement('div');
        fieldElement.className = 'game-field';
        fieldElement.style.setProperty('--cell-width', `${cellWidth}px`);
        fieldElement.style.setProperty('--cell-height', `${cellHeight}px`);
        fieldElement.style.setProperty('--cell-gap', `${cellGap}px`);

        // Создаем ячейки
        const cells = [];
        for (let row = 0; row < this.gridSize; row++) {
            for (let col = 0; col < this.gridSize; col++) {
                const cellIndex = row * this.gridSize + col;
                const isAvailable = !unavailableIndices.has(cellIndex);

                const cell = this.createCell(row, col, cellIndex, isAvailable);
                fieldElement.appendChild(cell);

                cells.push({
                    element: cell,
                    row,
                    col,
                    index: cellIndex,
                    isAvailable
                });
            }
        }

        // Возвращаем объект с элементом и метаданными
        return {
            element: fieldElement,
            cells,
            unavailableCount: numUnavailable,
            unavailableIndices: Array.from(unavailableIndices),
            gridSize: this.gridSize
        };
    }

    /**
     * Создание отдельной ячейки поля
     * @param {number} row - Номер строки (0-3)
     * @param {number} col - Номер столбца (0-3)
     * @param {number} index - Линейный индекс ячейки (0-15)
     * @param {boolean} isAvailable - Доступна ли ячейка для хода
     * @returns {HTMLElement} - DOM-элемент ячейки
     */
    createCell(row, col, index, isAvailable) {
        const cell = document.createElement('div');
        cell.className = `game-field-cell ${isAvailable ? 'available' : 'unavailable'}`;
        cell.dataset.row = row;
        cell.dataset.col = col;
        cell.dataset.index = index;
        cell.dataset.available = isAvailable;

        // Внутренний контейнер для контента ячейки
        const cellInner = document.createElement('div');
        cellInner.className = 'cell-inner';

        // Для недоступных ячеек добавляем визуальный индикатор
        if (!isAvailable) {
            const blockedIcon = document.createElement('div');
            blockedIcon.className = 'blocked-icon';
            blockedIcon.innerHTML = '&#10006;'; // Крестик
            cellInner.appendChild(blockedIcon);
        }

        // Индекс ячейки для отладки (опционально)
        const indexLabel = document.createElement('div');
        indexLabel.className = 'cell-index';
        indexLabel.textContent = index;
        cellInner.appendChild(indexLabel);

        cell.appendChild(cellInner);

        return cell;
    }

    /**
     * Перегенерация поля с новыми случайными значениями
     * @param {HTMLElement} container - Контейнер для поля
     * @param {Object} options - Опции отрисовки
     * @returns {Object} - Новый объект поля
     */
    regenerateField(container, options = {}) {
        container.innerHTML = '';
        const fieldData = this.renderField(options);
        container.appendChild(fieldData.element);
        return fieldData;
    }
}

// Создаем глобальный экземпляр рендерера поля
const gameFieldRenderer = new GameFieldRenderer();
