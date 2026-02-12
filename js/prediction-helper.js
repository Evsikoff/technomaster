/**
 * Prediction Helper Module for Technomaster
 * Модуль предиктивной визуализации хода.
 * Рассчитывает гипотетический результат хода и генерирует стрелки
 * для отображения захватов, битв и комбо-цепочек.
 */

const PredictionHelper = (() => {
    // === Направления (копия из оркестратора) ===
    const directions = [
        { name: 'topLeft', rowDelta: -1, colDelta: -1, activeArrow: 'arrowTopLeft', reactiveArrow: 'arrowBottomRight' },
        { name: 'top', rowDelta: -1, colDelta: 0, activeArrow: 'arrowTop', reactiveArrow: 'arrowBottom' },
        { name: 'topRight', rowDelta: -1, colDelta: 1, activeArrow: 'arrowTopRight', reactiveArrow: 'arrowBottomLeft' },
        { name: 'right', rowDelta: 0, colDelta: 1, activeArrow: 'arrowRight', reactiveArrow: 'arrowLeft' },
        { name: 'bottomRight', rowDelta: 1, colDelta: 1, activeArrow: 'arrowBottomRight', reactiveArrow: 'arrowTopLeft' },
        { name: 'bottom', rowDelta: 1, colDelta: 0, activeArrow: 'arrowBottom', reactiveArrow: 'arrowTop' },
        { name: 'bottomLeft', rowDelta: 1, colDelta: -1, activeArrow: 'arrowBottomLeft', reactiveArrow: 'arrowTopRight' },
        { name: 'left', rowDelta: 0, colDelta: -1, activeArrow: 'arrowLeft', reactiveArrow: 'arrowRight' }
    ];

    // Цвета для альтернативных целей битвы
    const BATTLE_CHOICE_COLORS = ['#FFA500', '#D000FF', '#00FFFF'];
    const SAFE_COLOR = '#00FF00';
    const BATTLE_COLOR = '#FF0000';

    // === Вспомогательные функции ===

    function getCellByIndex(cells, index) {
        return cells.find(c => c.index === index) || null;
    }

    function getNeighborCell(cells, cell, direction) {
        const row = cell.row + direction.rowDelta;
        const col = cell.col + direction.colDelta;
        if (row < 0 || row > 3 || col < 0 || col > 3) return null;
        return getCellByIndex(cells, row * 4 + col);
    }

    function getCardOwner(card) {
        if (!card) return null;
        if (card.owner) return card.owner;
        if (card.ownership === 'rival') return 'opponent';
        if (card.ownership === 'player') return 'player';
        return null;
    }

    function isEnemyCard(card, currentOwner) {
        const cardOwner = getCardOwner(card);
        if (!cardOwner) return false;
        return cardOwner !== currentOwner;
    }

    /**
     * Глубокое клонирование состояния поля
     */
    function cloneFieldCells(cells) {
        return cells.map(c => ({
            index: c.index,
            row: c.row !== undefined ? c.row : Math.floor(c.index / 4),
            col: c.col !== undefined ? c.col : c.index % 4,
            isAvailable: c.isAvailable,
            card: c.card ? { ...c.card } : null
        }));
    }

    /**
     * Рекурсивный поиск комбо-цепочек от захваченных карт.
     * Возвращает массив стрелок.
     */
    function simulateComboChain(cells, capturedIndices, newOwner, color, processedCells) {
        const arrows = [];

        for (const cellIndex of capturedIndices) {
            if (processedCells.has(cellIndex)) continue;
            processedCells.add(cellIndex);

            const cell = getCellByIndex(cells, cellIndex);
            if (!cell || !cell.card) continue;

            const card = cell.card;

            for (const direction of directions) {
                if (!card[direction.activeArrow]) continue;

                const neighborCell = getNeighborCell(cells, cell, direction);
                if (!neighborCell || !neighborCell.card) continue;

                if (isEnemyCard(neighborCell.card, newOwner)) {
                    // Виртуально захватываем
                    neighborCell.card.owner = newOwner;
                    neighborCell.card.ownership = newOwner === 'player' ? 'player' : 'rival';

                    arrows.push({
                        fromIndex: cellIndex,
                        toIndex: neighborCell.index,
                        type: color === SAFE_COLOR ? 'safe' : 'combo_from_battle',
                        color: color
                    });

                    // Рекурсия
                    const comboArrows = simulateComboChain(
                        cells, [neighborCell.index], newOwner, color, processedCells
                    );
                    arrows.push(...comboArrows);
                }
            }
        }

        return arrows;
    }

    // === Основная функция расчёта ===

    /**
     * Рассчитывает гипотетический результат хода.
     *
     * @param {Object} card - Перетаскиваемая карта
     * @param {number} cellIndex - Индекс ячейки, куда тащим
     * @param {Array} fieldCells - Текущее состояние поля (массив ячеек)
     * @returns {Object} PredictionResult - { outcomeType, arrows }
     */
    function calculateOutcome(card, cellIndex, fieldCells) {
        if (!card || cellIndex == null || !fieldCells || fieldCells.length === 0) {
            return { outcomeType: 'none', arrows: [] };
        }

        // 1. Виртуальное размещение: клонируем поле и размещаем карту
        const cells = cloneFieldCells(fieldCells);
        const targetCell = getCellByIndex(cells, cellIndex);

        if (!targetCell || !targetCell.isAvailable || targetCell.card) {
            return { outcomeType: 'none', arrows: [] };
        }

        // Размещаем карту виртуально
        const placedCard = { ...card, owner: 'player' };
        targetCell.card = placedCard;

        // 2. Анализ соседей
        const captures = [];  // Группа A: захват без боя
        const battles = [];   // Группа B: битва

        for (const direction of directions) {
            const hasActiveArrow = placedCard[direction.activeArrow] === true;
            if (!hasActiveArrow) continue;

            const neighborCell = getNeighborCell(cells, targetCell, direction);
            if (!neighborCell || !neighborCell.card) continue;
            if (!isEnemyCard(neighborCell.card, 'player')) continue;

            const hasReactiveArrow = neighborCell.card[direction.reactiveArrow] === true;

            if (!hasReactiveArrow) {
                captures.push({
                    direction,
                    defenderCellIndex: neighborCell.index,
                    defenderCard: neighborCell.card
                });
            } else {
                battles.push({
                    direction,
                    defenderCellIndex: neighborCell.index,
                    defenderCard: neighborCell.card
                });
            }
        }

        // 3. Генерация стрелок
        const arrows = [];

        // Сценарий 1: Захваты без боя (зелёные стрелки)
        if (captures.length > 0) {
            const capturedIndices = [];

            for (const capture of captures) {
                arrows.push({
                    fromIndex: cellIndex,
                    toIndex: capture.defenderCellIndex,
                    type: 'safe',
                    color: SAFE_COLOR
                });

                // Виртуально захватываем
                const defCell = getCellByIndex(cells, capture.defenderCellIndex);
                if (defCell && defCell.card) {
                    defCell.card.owner = 'player';
                    defCell.card.ownership = 'player';
                }

                capturedIndices.push(capture.defenderCellIndex);
            }

            // Симуляция комбо от захваченных карт
            const processedCells = new Set([cellIndex]);
            const comboArrows = simulateComboChain(
                cells, capturedIndices, 'player', SAFE_COLOR, processedCells
            );
            arrows.push(...comboArrows);
        }

        // Сценарий 2: Одиночная битва (красная стрелка)
        if (battles.length === 1) {
            const battle = battles[0];
            arrows.push({
                fromIndex: cellIndex,
                toIndex: battle.defenderCellIndex,
                type: 'battle',
                color: BATTLE_COLOR
            });

            // Оптимистичная симуляция комбо (представляем, что победили)
            const comboClone = cloneFieldCells(cells);
            const defCell = getCellByIndex(comboClone, battle.defenderCellIndex);
            if (defCell && defCell.card) {
                defCell.card.owner = 'player';
                defCell.card.ownership = 'player';
            }

            const processedCells = new Set([cellIndex]);
            const comboArrows = simulateComboChain(
                comboClone, [battle.defenderCellIndex], 'player', BATTLE_COLOR, processedCells
            );
            arrows.push(...comboArrows);
        }

        // Сценарий 3: Множественные битвы (разноцветные стрелки)
        if (battles.length > 1) {
            battles.forEach((battle, index) => {
                const color = BATTLE_CHOICE_COLORS[index % BATTLE_CHOICE_COLORS.length];
                const typeLabel = `battle_choice_${index + 1}`;

                arrows.push({
                    fromIndex: cellIndex,
                    toIndex: battle.defenderCellIndex,
                    type: typeLabel,
                    color: color
                });

                // Оптимистичная симуляция комбо для каждой цели
                const comboClone = cloneFieldCells(cells);
                const defCell = getCellByIndex(comboClone, battle.defenderCellIndex);
                if (defCell && defCell.card) {
                    defCell.card.owner = 'player';
                    defCell.card.ownership = 'player';
                }

                const processedCells = new Set([cellIndex]);
                const comboArrows = simulateComboChain(
                    comboClone, [battle.defenderCellIndex], 'player', color, processedCells
                );
                arrows.push(...comboArrows);
            });
        }

        // Определяем тип результата
        let outcomeType = 'none';
        if (captures.length > 0 && battles.length > 0) {
            outcomeType = 'mixed';
        } else if (captures.length > 0) {
            outcomeType = 'safe';
        } else if (battles.length > 0) {
            outcomeType = 'battle';
        }

        return { outcomeType, arrows };
    }

    // === SVG Overlay для рисования стрелок ===

    let svgOverlay = null;
    let currentHoverIndex = null;

    /**
     * Инициализация SVG-слоя поверх игрового поля.
     * Вызывается один раз после создания поля.
     */
    function initOverlay() {
        removeOverlay();

        const fieldWrapper = document.getElementById('gameFieldContainer');
        if (!fieldWrapper) return;

        const field = fieldWrapper.querySelector('.game-field');
        if (!field) return;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'prediction-overlay');
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '10';
        svg.style.overflow = 'visible';

        // Маркеры для наконечников стрелок (различные цвета)
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.appendChild(defs);

        fieldWrapper.style.position = 'relative';
        fieldWrapper.appendChild(svg);

        svgOverlay = svg;
    }

    /**
     * Удаление SVG-оверлея
     */
    function removeOverlay() {
        if (svgOverlay) {
            svgOverlay.remove();
            svgOverlay = null;
        }
    }

    /**
     * Получить или создать маркер (наконечник стрелки) нужного цвета
     */
    function getOrCreateMarker(color) {
        if (!svgOverlay) return '';

        const markerId = 'arrow-marker-' + color.replace('#', '');
        let marker = svgOverlay.querySelector('#' + markerId);
        if (!marker) {
            const defs = svgOverlay.querySelector('defs');
            marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', markerId);
            marker.setAttribute('markerWidth', '10');
            marker.setAttribute('markerHeight', '8');
            marker.setAttribute('refX', '9');
            marker.setAttribute('refY', '4');
            marker.setAttribute('orient', 'auto');
            marker.setAttribute('markerUnits', 'userSpaceOnUse');

            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            polygon.setAttribute('points', '0 0, 10 4, 0 8');
            polygon.setAttribute('fill', color);
            marker.appendChild(polygon);

            defs.appendChild(marker);
        }

        return `url(#${markerId})`;
    }

    /**
     * Получить центр ячейки в координатах SVG-оверлея
     */
    function getCellCenter(cellIndex) {
        const fieldWrapper = document.getElementById('gameFieldContainer');
        const field = fieldWrapper ? fieldWrapper.querySelector('.game-field') : null;
        if (!field || !svgOverlay) return null;

        const cell = field.querySelector(`.game-field-cell[data-index="${cellIndex}"]`);
        if (!cell) return null;

        // Получаем scale поля
        const fieldTransform = getComputedStyle(field).transform;
        let fieldScale = 1;
        if (fieldTransform && fieldTransform !== 'none') {
            const matrix = fieldTransform.match(/matrix\(([^)]+)\)/);
            if (matrix) {
                const values = matrix[1].split(',').map(Number);
                fieldScale = values[0]; // scaleX
            }
        }

        // Позиция ячейки относительно поля
        const cellRect = cell.getBoundingClientRect();
        const wrapperRect = fieldWrapper.getBoundingClientRect();

        return {
            x: (cellRect.left - wrapperRect.left + cellRect.width / 2),
            y: (cellRect.top - wrapperRect.top + cellRect.height / 2)
        };
    }

    /**
     * Отрисовка массива стрелок на SVG-слое
     */
    function renderArrows(arrows) {
        if (!svgOverlay) return;

        clearArrows();

        for (const arrow of arrows) {
            const from = getCellCenter(arrow.fromIndex);
            const to = getCellCenter(arrow.toIndex);
            if (!from || !to) continue;

            const isBattle = arrow.type === 'battle' || arrow.type.startsWith('battle_choice') || arrow.type === 'combo_from_battle';
            const isSafe = arrow.type === 'safe';

            // Сокращаем линию, чтобы наконечник не налезал на центр ячейки
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const shortenBy = 20;
            const endX = to.x - (dx / len) * shortenBy;
            const endY = to.y - (dy / len) * shortenBy;
            const startX = from.x + (dx / len) * (shortenBy * 0.5);
            const startY = from.y + (dy / len) * (shortenBy * 0.5);

            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.setAttribute('class', 'prediction-arrow');

            // Обводка (чёрный контур для читаемости)
            const bgLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            bgLine.setAttribute('x1', startX);
            bgLine.setAttribute('y1', startY);
            bgLine.setAttribute('x2', endX);
            bgLine.setAttribute('y2', endY);
            bgLine.setAttribute('stroke', 'rgba(0,0,0,0.6)');
            bgLine.setAttribute('stroke-width', '8');
            bgLine.setAttribute('stroke-linecap', 'round');
            group.appendChild(bgLine);

            // Основная линия
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', startX);
            line.setAttribute('y1', startY);
            line.setAttribute('x2', endX);
            line.setAttribute('y2', endY);
            line.setAttribute('stroke', arrow.color);
            line.setAttribute('stroke-width', '5');
            line.setAttribute('stroke-linecap', 'round');
            line.setAttribute('marker-end', getOrCreateMarker(arrow.color));

            if (isBattle) {
                line.setAttribute('stroke-dasharray', '10 5');
            }

            // Пульсация для safe-стрелок
            if (isSafe) {
                const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
                anim.setAttribute('attributeName', 'opacity');
                anim.setAttribute('values', '1;0.5;1');
                anim.setAttribute('dur', '1.5s');
                anim.setAttribute('repeatCount', 'indefinite');
                line.appendChild(anim);
            }

            group.appendChild(line);

            // Иконка на линии
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;

            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            icon.setAttribute('x', midX);
            icon.setAttribute('y', midY);
            icon.setAttribute('text-anchor', 'middle');
            icon.setAttribute('dominant-baseline', 'central');
            icon.setAttribute('font-size', '14');
            icon.setAttribute('fill', 'white');
            icon.setAttribute('stroke', 'black');
            icon.setAttribute('stroke-width', '0.5');
            icon.setAttribute('class', 'prediction-icon');

            if (isSafe) {
                icon.textContent = '\u2714'; // checkmark
            } else if (isBattle) {
                icon.textContent = '\u2694'; // crossed swords
            }

            group.appendChild(icon);

            svgOverlay.appendChild(group);
        }
    }

    /**
     * Очистка всех стрелок
     */
    function clearArrows() {
        if (!svgOverlay) return;
        const arrows = svgOverlay.querySelectorAll('.prediction-arrow');
        arrows.forEach(a => a.remove());
        currentHoverIndex = null;
    }

    /**
     * Обработка наведения на ячейку.
     * Вызывается из dragenter/dragover. Кэширует по индексу.
     *
     * @param {Object} card - Перетаскиваемая карта
     * @param {number} cellIndex - Индекс ячейки
     * @param {Array} fieldCells - Текущее состояние поля
     */
    function onCellHover(card, cellIndex, fieldCells) {
        if (cellIndex === currentHoverIndex) return; // Кэш
        currentHoverIndex = cellIndex;

        const result = calculateOutcome(card, cellIndex, fieldCells);

        if (result.arrows.length > 0) {
            renderArrows(result.arrows);
        } else {
            clearArrows();
        }
    }

    /**
     * Сброс при уходе с ячейки
     */
    function onCellLeave() {
        clearArrows();
    }

    // === Публичный API ===
    return {
        calculateOutcome,
        initOverlay,
        removeOverlay,
        renderArrows,
        clearArrows,
        onCellHover,
        onCellLeave
    };
})();

window.PredictionHelper = PredictionHelper;

console.log('PredictionHelper: Модуль предиктивной визуализации загружен.');
