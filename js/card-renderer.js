/**
 * Card Renderer Module for Technomaster
 * Модуль отрисовки открытых экземпляров карт
 */

class CardRenderer {
    constructor() {
        this.db = null;
        this.dbReady = false;
        this.cardTypesCache = new Map();
    }

    /**
     * Инициализация модуля - загрузка базы данных SQLite
     * @returns {Promise<void>}
     */
    async init() {
        if (this.dbReady) return;

        try {
            // Загружаем sql.js
            const SQL = await initSqlJs({
                locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
            });

            // Загружаем файл базы данных
            const response = await fetch('public/data/cards.db');
            const buffer = await response.arrayBuffer();

            // Создаем базу данных из буфера
            this.db = new SQL.Database(new Uint8Array(buffer));
            this.dbReady = true;

            console.log('CardRenderer: База данных загружена успешно');
        } catch (error) {
            console.error('CardRenderer: Ошибка загрузки базы данных:', error);
            throw error;
        }
    }

    /**
     * Получение данных типа карты из базы данных
     * @param {number} cardTypeId - Идентификатор типа карты
     * @returns {Object|null} - Данные типа карты или null
     */
    getCardType(cardTypeId) {
        if (!this.dbReady) {
            throw new Error('База данных не инициализирована. Вызовите init() перед использованием.');
        }

        // Проверяем кэш
        if (this.cardTypesCache.has(cardTypeId)) {
            return this.cardTypesCache.get(cardTypeId);
        }

        try {
            const result = this.db.exec(
                `SELECT id, name, image FROM card_types WHERE id = ${cardTypeId}`
            );

            if (result.length === 0 || result[0].values.length === 0) {
                return null;
            }

            const row = result[0].values[0];
            const cardType = {
                id: row[0],
                name: row[1],
                image: row[2]
            };

            // Сохраняем в кэш
            this.cardTypesCache.set(cardTypeId, cardType);

            return cardType;
        } catch (error) {
            console.error('CardRenderer: Ошибка получения типа карты:', error);
            return null;
        }
    }

    /**
     * Получение пути к файлу рамки на основе уровня карты
     * @param {string} cardLevel - Уровень карты ("1", "2", "3")
     * @returns {string} - Путь к файлу рамки
     */
    getFramePath(cardLevel) {
        const frameFiles = {
            '1': '1level.png',
            '2': '2level.png',
            '3': '3level.png'
        };
        return `public/img/card_frames/${frameFiles[cardLevel] || '1level.png'}`;
    }

    /**
     * Получение пути к фону карты на основе принадлежности
     * @param {string} ownership - Принадлежность карты ("player", "rival")
     * @returns {string} - Путь к файлу фона
     */
    getBackgroundPath(ownership) {
        const backgroundFiles = {
            'player': 'mycard.png',
            'rival': 'rivalcard.png'
        };
        return `public/img/card_backs/${backgroundFiles[ownership] || 'mycard.png'}`;
    }

    /**
     * Получение пути к изображению типа карты
     * @param {string} imageFileName - Имя файла изображения из базы данных
     * @returns {string} - Путь к файлу изображения
     */
    getCardImagePath(imageFileName) {
        return `public/img/card_types/${imageFileName}`;
    }

    /**
     * Получение символа стрелки по направлению
     * @param {string} direction - Направление стрелки
     * @returns {string} - Unicode символ стрелки
     */
    getArrowSymbol(direction) {
        const arrows = {
            'topLeft': '◤',
            'top': '▲',
            'topRight': '◥',
            'right': '▶',
            'bottomRight': '◢',
            'bottom': '▼',
            'bottomLeft': '◣',
            'left': '◀'
        };
        return arrows[direction] || '';
    }

    /**
     * Главная функция отрисовки открытого экземпляра карты
     *
     * @param {Object} params - Параметры карты
     * @param {number} params.cardTypeId - Идентификатор типа карты (целое число)
     * @param {boolean} params.arrowTopLeft - Стрелка в левом верхнем углу
     * @param {boolean} params.arrowTop - Стрелка наверху
     * @param {boolean} params.arrowTopRight - Стрелка в правом верхнем углу
     * @param {boolean} params.arrowRight - Стрелка вправо
     * @param {boolean} params.arrowBottomRight - Стрелка в правом нижнем углу
     * @param {boolean} params.arrowBottom - Стрелка вниз
     * @param {boolean} params.arrowBottomLeft - Стрелка в левом нижнем углу
     * @param {boolean} params.arrowLeft - Стрелка влево
     * @param {string} params.ownership - Принадлежность карты ("player" | "rival")
     * @param {string} params.cardLevel - Уровень карты ("1" | "2" | "3")
     * @param {string} params.attackLevel - Уровень атаки (символ)
     * @param {string} params.attackType - Тип атаки (символ)
     * @param {string} params.mechanicalDefense - Механическая защита (символ)
     * @param {string} params.electricalDefense - Электрическая защита (символ)
     *
     * @returns {HTMLElement} - DOM-элемент карты
     */
    renderCard(params) {
        const {
            cardTypeId,
            arrowTopLeft = false,
            arrowTop = false,
            arrowTopRight = false,
            arrowRight = false,
            arrowBottomRight = false,
            arrowBottom = false,
            arrowBottomLeft = false,
            arrowLeft = false,
            ownership = 'player',
            cardLevel = '1',
            attackLevel = '0',
            attackType = 'P',
            mechanicalDefense = '0',
            electricalDefense = '0'
        } = params;

        // Получаем данные типа карты из базы данных
        const cardType = this.getCardType(cardTypeId);
        if (!cardType) {
            return this.renderErrorCard(`Тип карты с ID ${cardTypeId} не найден`);
        }

        // Создаем основной контейнер карты
        const cardElement = document.createElement('div');
        cardElement.className = 'game-card';

        // Создаем обертку
        const wrapper = document.createElement('div');
        wrapper.className = 'card-wrapper';

        // === ФРЕЙМ ИЗОБРАЖЕНИЯ КАРТЫ ===
        const imageFrame = document.createElement('div');
        imageFrame.className = 'card-image-frame';

        // Фон карты (по принадлежности)
        const background = document.createElement('img');
        background.className = 'card-background';
        background.src = this.getBackgroundPath(ownership);
        background.alt = 'Card background';

        // Изображение типа карты
        const cardImage = document.createElement('img');
        cardImage.className = 'card-type-image';
        cardImage.src = this.getCardImagePath(cardType.image);
        cardImage.alt = cardType.name;

        // Рамка карты (по уровню)
        const frame = document.createElement('img');
        frame.className = 'card-frame';
        frame.src = this.getFramePath(cardLevel);
        frame.alt = `Level ${cardLevel} frame`;

        imageFrame.appendChild(background);
        imageFrame.appendChild(cardImage);
        imageFrame.appendChild(frame);

        // === ФРЕЙМ ДАННЫХ КАРТЫ ===
        const dataFrame = document.createElement('div');
        dataFrame.className = `card-data-frame ${ownership}`;

        // Название типа карты
        const cardName = document.createElement('div');
        cardName.className = 'card-name';
        cardName.textContent = cardType.name;
        cardName.title = cardType.name; // Tooltip для длинных названий

        // Блок статов
        const statsBlock = document.createElement('div');
        statsBlock.className = 'card-stats';

        // Уровень атаки
        const attackLevelStat = this.createStatItem(attackLevel, 'attack', 'Атака - сила удара карты');
        // Тип атаки
        const attackTypeStat = this.createStatItem(attackType, 'attack-type', 'Тип атаки (P - физическая, E - электрическая)');
        // Механическая защита
        const mechDefStat = this.createStatItem(mechanicalDefense, 'mech-def', 'Механическая защита - защита от физических атак');
        // Электрическая защита
        const elecDefStat = this.createStatItem(electricalDefense, 'elec-def', 'Электрическая защита - защита от электрических атак');

        statsBlock.appendChild(attackLevelStat);
        statsBlock.appendChild(attackTypeStat);
        statsBlock.appendChild(mechDefStat);
        statsBlock.appendChild(elecDefStat);

        dataFrame.appendChild(cardName);
        dataFrame.appendChild(statsBlock);

        // === СТРЕЛКИ ===
        const arrowsContainer = document.createElement('div');
        arrowsContainer.className = 'card-arrows';

        const arrowsConfig = [
            { enabled: arrowTopLeft, direction: 'topLeft', className: 'arrow-top-left' },
            { enabled: arrowTop, direction: 'top', className: 'arrow-top' },
            { enabled: arrowTopRight, direction: 'topRight', className: 'arrow-top-right' },
            { enabled: arrowRight, direction: 'right', className: 'arrow-right' },
            { enabled: arrowBottomRight, direction: 'bottomRight', className: 'arrow-bottom-right' },
            { enabled: arrowBottom, direction: 'bottom', className: 'arrow-bottom' },
            { enabled: arrowBottomLeft, direction: 'bottomLeft', className: 'arrow-bottom-left' },
            { enabled: arrowLeft, direction: 'left', className: 'arrow-left' }
        ];

        arrowsConfig.forEach(arrow => {
            if (arrow.enabled) {
                const arrowElement = document.createElement('span');
                arrowElement.className = `arrow ${arrow.className}`;
                arrowElement.textContent = this.getArrowSymbol(arrow.direction);
                arrowsContainer.appendChild(arrowElement);
            }
        });

        // Собираем карту
        wrapper.appendChild(imageFrame);
        wrapper.appendChild(dataFrame);
        wrapper.appendChild(arrowsContainer);
        cardElement.appendChild(wrapper);

        return cardElement;
    }

    /**
     * Создание элемента стата
     * @param {string} value - Значение стата
     * @param {string} type - Тип стата для стилизации
     * @param {string} tooltip - Подсказка при наведении мыши
     * @returns {HTMLElement} - DOM-элемент стата
     */
    createStatItem(value, type, tooltip = '') {
        const statItem = document.createElement('div');
        statItem.className = `stat-item ${type}`;
        if (tooltip) {
            statItem.title = tooltip;
        }

        const statValue = document.createElement('span');
        statValue.className = 'stat-value';
        statValue.textContent = value;

        statItem.appendChild(statValue);

        return statItem;
    }

    /**
     * Отрисовка карты с ошибкой
     * @param {string} message - Сообщение об ошибке
     * @returns {HTMLElement} - DOM-элемент с ошибкой
     */
    renderErrorCard(message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'error';
        errorElement.textContent = `Ошибка: ${message}`;
        return errorElement;
    }

    /**
     * Получение списка всех типов карт
     * @returns {Array} - Массив объектов типов карт
     */
    getAllCardTypes() {
        if (!this.dbReady) {
            throw new Error('База данных не инициализирована');
        }

        try {
            const result = this.db.exec('SELECT id, name, image FROM card_types ORDER BY id');
            if (result.length === 0) return [];

            return result[0].values.map(row => ({
                id: row[0],
                name: row[1],
                image: row[2]
            }));
        } catch (error) {
            console.error('CardRenderer: Ошибка получения списка карт:', error);
            return [];
        }
    }

    /**
     * Получение количества типов карт в базе
     * @returns {number} - Количество типов карт
     */
    getCardTypesCount() {
        if (!this.dbReady) return 0;

        try {
            const result = this.db.exec('SELECT COUNT(*) FROM card_types');
            return result[0].values[0][0];
        } catch (error) {
            return 0;
        }
    }

    /**
     * Генерация колоды карт по заданным параметрам
     * @param {Object} params - Параметры генерации
     * @param {number} params.deck_size - Размер колоды
     * @param {number} params.level_min - Минимальный уровень карты (0-3)
     * @param {number} params.level_max - Максимальный уровень карты (0-3)
     * @param {number} params.group_1_weight - Вес группы 1
     * @param {number} params.group_2_weight - Вес группы 2
     * @param {number} params.group_3_weight - Вес группы 3
     * @param {number} params.group_4_weight - Вес группы 4
     * @returns {Array} - Массив сгенерированных карт
     */
    generateDeck(params) {
        if (!this.dbReady) {
            throw new Error('База данных не инициализирована. Вызовите init() перед использованием.');
        }

        const {
            deck_size,
            level_min,
            level_max,
            group_1_weight = 0,
            group_2_weight = 0,
            group_3_weight = 0,
            group_4_weight = 0
        } = params;

        if (!Number.isInteger(deck_size) || deck_size <= 0) {
            throw new Error('Некорректный размер колоды: deck_size должен быть целым числом больше 0.');
        }

        if (!Number.isInteger(level_min) || !Number.isInteger(level_max)) {
            throw new Error('Параметры уровня карты должны быть целыми числами.');
        }

        if (level_min < 0 || level_min > 3 || level_max < 0 || level_max > 3) {
            throw new Error('Уровень карты должен быть в диапазоне 0-3.');
        }

        if (level_min > level_max) {
            throw new Error('level_min не может быть больше level_max.');
        }

        const groupWeights = [
            { sequence: 1, weight: group_1_weight },
            { sequence: 2, weight: group_2_weight },
            { sequence: 3, weight: group_3_weight },
            { sequence: 4, weight: group_4_weight }
        ];

        const totalGroupWeight = groupWeights.reduce((sum, item) => sum + item.weight, 0);
        if (totalGroupWeight <= 0) {
            throw new Error('Суммарный вес групп должен быть больше 0.');
        }

        const groupRows = this.db.exec(
            'SELECT id, sequence FROM card_groups WHERE sequence IN (1, 2, 3, 4)'
        );
        const groupMap = new Map();
        if (groupRows.length > 0) {
            groupRows[0].values.forEach(row => {
                groupMap.set(row[1], row[0]);
            });
        }

        const arrowDirections = [
            'topLeft',
            'top',
            'topRight',
            'right',
            'bottomRight',
            'bottom',
            'bottomLeft',
            'left'
        ];

        const deck = [];

        for (let index = 0; index < deck_size; index += 1) {
            const groupSequence = this.pickWeightedValue(groupWeights);
            const groupId = groupMap.get(groupSequence);
            if (!groupId) {
                throw new Error(`Группа с sequence=${groupSequence} не найдена в базе данных.`);
            }

            const cardTypesResult = this.db.exec(
                `SELECT id, attack_type FROM card_types WHERE group_id = ${groupId}`
            );
            if (cardTypesResult.length === 0 || cardTypesResult[0].values.length === 0) {
                throw new Error(`Для группы ${groupSequence} не найдено типов карт.`);
            }

            const cardTypeRow = this.pickRandomRow(cardTypesResult[0].values);
            const cardTypeId = cardTypeRow[0];
            const attackType = cardTypeRow[1];

            const cardLevel = this.getRandomIntInclusive(level_min, level_max);

            const levelsResult = this.db.exec(
                `SELECT power_min, power_max, reliability_min, reliability_max, shielding_min, shielding_max,` +
                ` arrows_1, arrows_2, arrows_3, arrows_4, arrows_5, arrows_6, arrows_7, arrows_8` +
                ` FROM card_levels WHERE card_type_id = ${cardTypeId} AND level = ${cardLevel}`
            );

            if (levelsResult.length === 0 || levelsResult[0].values.length === 0) {
                throw new Error(`Не найдены уровни для card_type_id=${cardTypeId} и level=${cardLevel}.`);
            }

            const levelRow = levelsResult[0].values[0];
            const powerMin = levelRow[0];
            const powerMax = levelRow[1];
            const reliabilityMin = levelRow[2];
            const reliabilityMax = levelRow[3];
            const shieldingMin = levelRow[4];
            const shieldingMax = levelRow[5];
            const arrowWeights = levelRow.slice(6, 14);

            const attackLevel = this.getRandomIntInclusive(powerMin, powerMax);
            const mechanicalDefense = this.getRandomIntInclusive(reliabilityMin, reliabilityMax);
            const electricalDefense = this.getRandomIntInclusive(shieldingMin, shieldingMax);
            const arrowsCount = this.pickWeightedIndex(arrowWeights);

            const arrowFlags = this.assignRandomArrows(arrowDirections, arrowsCount);

            const renderParams = {
                cardTypeId,
                arrowTopLeft: arrowFlags.topLeft,
                arrowTop: arrowFlags.top,
                arrowTopRight: arrowFlags.topRight,
                arrowRight: arrowFlags.right,
                arrowBottomRight: arrowFlags.bottomRight,
                arrowBottom: arrowFlags.bottom,
                arrowBottomLeft: arrowFlags.bottomLeft,
                arrowLeft: arrowFlags.left,
                ownership: 'player',
                cardLevel: String(cardLevel),
                attackLevel: String(attackLevel),
                attackType: attackType,
                mechanicalDefense: String(mechanicalDefense),
                electricalDefense: String(electricalDefense)
            };

            deck.push({
                renderParams,
                cardCode: JSON.stringify(renderParams)
            });
        }

        return deck;
    }

    /**
     * Выбор значения по весам
     * @param {Array} weightedItems - Массив объектов { sequence, weight }
     * @returns {number} - sequence выбранного элемента
     */
    pickWeightedValue(weightedItems) {
        const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);
        const roll = Math.random() * totalWeight;
        let current = 0;

        for (const item of weightedItems) {
            current += item.weight;
            if (roll <= current) {
                return item.sequence;
            }
        }

        return weightedItems[weightedItems.length - 1].sequence;
    }

    /**
     * Выбор количества по весам (индекс -> количество)
     * @param {Array} weights - Массив весов (arrows_1 ... arrows_8)
     * @returns {number} - Количество стрелок
     */
    pickWeightedIndex(weights) {
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        if (totalWeight <= 0) {
            return 0;
        }

        const roll = Math.random() * totalWeight;
        let current = 0;

        for (let index = 0; index < weights.length; index += 1) {
            current += weights[index];
            if (roll <= current) {
                return index + 1;
            }
        }

        return weights.length;
    }

    /**
     * Случайный выбор строки из набора
     * @param {Array} rows - Массив строк
     * @returns {Array} - Случайная строка
     */
    pickRandomRow(rows) {
        const index = Math.floor(Math.random() * rows.length);
        return rows[index];
    }

    /**
     * Случайное распределение стрелок по направлениям
     * @param {Array} directions - Список направлений
     * @param {number} count - Количество стрелок
     * @returns {Object} - Объект с флагами направлений
     */
    assignRandomArrows(directions, count) {
        const shuffled = [...directions];
        for (let index = shuffled.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
        }

        const selected = new Set(shuffled.slice(0, count));
        const flags = {};

        directions.forEach(direction => {
            flags[direction] = selected.has(direction);
        });

        return flags;
    }

    getRandomIntInclusive(min, max) {
        const minimum = Math.min(min, max);
        const maximum = Math.max(min, max);
        return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
    }

    /**
     * Получение правил генерации стартовой колоды
     * @returns {Object|null}
     */
    getStarterDeckRules() {
        if (!this.dbReady) {
            throw new Error('База данных не инициализирована');
        }

        try {
            // Читаем запись со значением поля "id" = "0" (как требуется для колоды размером 8 карт)
            const result = this.db.exec('SELECT * FROM deck_rules WHERE id = 0');

            if (!result.length || !result[0].values.length) {
                console.warn('CardRenderer: Правила для стартовой колоды не найдены (id=0)');
                return null;
            }

            const columns = result[0].columns;
            const row = result[0].values[0];
            const rules = {};

            columns.forEach((col, index) => {
                rules[col] = row[index];
            });

            return rules;
        } catch (error) {
            console.error('CardRenderer: Ошибка получения правил колоды:', error);
            return null;
        }
    }
}

// Создаем глобальный экземпляр рендерера и привязываем к window
const cardRenderer = new CardRenderer();
window.cardRenderer = cardRenderer;
