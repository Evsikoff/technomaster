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
        const attackLevelStat = this.createStatItem('А', attackLevel, 'attack', 'Атака - сила удара карты');
        // Тип атаки
        const attackTypeStat = this.createStatItem('Т', attackType, 'attack-type', 'Тип атаки (P - физическая, E - электрическая)');
        // Механическая защита
        const mechDefStat = this.createStatItem('М', mechanicalDefense, 'mech-def', 'Механическая защита - защита от физических атак');
        // Электрическая защита
        const elecDefStat = this.createStatItem('Э', electricalDefense, 'elec-def', 'Электрическая защита - защита от электрических атак');

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
     * @param {string} label - Метка стата
     * @param {string} value - Значение стата
     * @param {string} type - Тип стата для стилизации
     * @param {string} tooltip - Подсказка при наведении мыши
     * @returns {HTMLElement} - DOM-элемент стата
     */
    createStatItem(label, value, type, tooltip = '') {
        const statItem = document.createElement('div');
        statItem.className = `stat-item ${type}`;
        if (tooltip) {
            statItem.title = tooltip;
        }

        const statLabel = document.createElement('span');
        statLabel.className = 'stat-label';
        statLabel.textContent = label + ':';

        const statValue = document.createElement('span');
        statValue.className = 'stat-value';
        statValue.textContent = value;

        statItem.appendChild(statLabel);
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
}

// Создаем глобальный экземпляр рендерера
const cardRenderer = new CardRenderer();
