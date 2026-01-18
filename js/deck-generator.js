/**
 * Deck Generator Module for Technomaster
 * Модуль генерации колод по правилам из базы данных
 */

class DeckGenerator {
    constructor() {
        this.db = null;
        this.dbReady = false;
    }

    /**
     * Инициализация модуля - загрузка базы данных SQLite
     * @returns {Promise<void>}
     */
    async init() {
        if (this.dbReady) return;

        try {
            const SQL = await initSqlJs({
                locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
            });

            const response = await fetch('public/data/cards.db');
            const buffer = await response.arrayBuffer();

            this.db = new SQL.Database(new Uint8Array(buffer));
            this.dbReady = true;

            console.log('DeckGenerator: База данных загружена успешно');
        } catch (error) {
            console.error('DeckGenerator: Ошибка загрузки базы данных:', error);
            throw error;
        }
    }

    /**
     * Получение параметров генерации колоды по правилу
     * @param {number} ruleId - Идентификатор правила
     * @returns {Object|null} - Параметры генерации или null
     */
    getDeckRuleById(ruleId) {
        if (!this.dbReady) {
            throw new Error('База данных не инициализирована. Вызовите init() перед использованием.');
        }

        if (!Number.isInteger(ruleId)) {
            throw new Error('Некорректный идентификатор правила колоды.');
        }

        try {
            const result = this.db.exec(
                'SELECT deck_size, level_min, level_max, group_1_weight, group_2_weight, group_3_weight, group_4_weight' +
                ` FROM deck_rules WHERE id = ${ruleId}`
            );

            if (!result.length || !result[0].values.length) {
                return null;
            }

            const row = result[0].values[0];
            return {
                deck_size: row[0],
                level_min: row[1],
                level_max: row[2],
                group_1_weight: row[3],
                group_2_weight: row[4],
                group_3_weight: row[5],
                group_4_weight: row[6]
            };
        } catch (error) {
            console.error('DeckGenerator: Ошибка получения правил колоды:', error);
            return null;
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
     * Выбор случайной строки из массива
     * @param {Array} rows - Массив строк
     * @returns {Array} - Случайная строка
     */
    pickRandomRow(rows) {
        const index = Math.floor(Math.random() * rows.length);
        return rows[index];
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

    /**
     * Получение случайного целого числа в диапазоне
     * @param {number} min - Минимальное значение
     * @param {number} max - Максимальное значение
     * @returns {number}
     */
    getRandomIntInclusive(min, max) {
        const minimum = Math.min(min, max);
        const maximum = Math.max(min, max);
        return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
    }
}

const deckGenerator = new DeckGenerator();
window.deckGenerator = deckGenerator;
