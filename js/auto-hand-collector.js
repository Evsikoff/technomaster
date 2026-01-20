/**
 * Auto Hand Collector Module for Technomaster
 * Модуль автоматического сбора оптимальной руки из колоды
 *
 * Использование из консоли браузера:
 * autoHandCollector.collectHand(cards) - собрать руку из 5 карт
 * autoHandCollector.collectHandVerbose(cards) - собрать руку с подробным логом
 */

class AutoHandCollector {
    constructor() {
        // Конфигурация алгоритма
        this.config = {
            handSize: 5,
            // Веса для расчета Power Score
            attackWeight: 1.5,
            defenseWeight: 1.0,
            // Бонусы за тип атаки
            assaultTypeBonus: 15,    // Тип A (Assault)
            flexibleTypeBonus: 12,   // Тип X (Flexible)
            // Порог для замены при проверке разнообразия (10-15%)
            diversityThreshold: 0.85,
            // Типы атаки, дающие бонус
            bonusAttackTypes: ['A', 'X']
        };
    }

    /**
     * Этап 1: Расчет рейтингов для карты
     * @param {Object} card - Объект карты
     * @returns {Object} - Карта с добавленными рейтингами
     */
    calculateScores(card) {
        // Преобразуем строковые значения в числа
        const attackLevel = this.parseNumber(card.attackLevel);
        const mechanicalDefense = this.parseNumber(card.mechanicalDefense);
        const electricalDefense = this.parseNumber(card.electricalDefense);
        const attackType = card.attackType || '';

        // Рейтинг Силы (Power Score)
        // Формула: (attackLevel * 1.5) + mechanicalDefense + electricalDefense + бонус за тип
        let powerScore = (attackLevel * this.config.attackWeight) +
                         (mechanicalDefense * this.config.defenseWeight) +
                         (electricalDefense * this.config.defenseWeight);

        // Бонус за тип атаки
        if (attackType === 'A') {
            powerScore += this.config.assaultTypeBonus;
        } else if (attackType === 'X') {
            powerScore += this.config.flexibleTypeBonus;
        }

        // Рейтинг Комбо (Connectivity Score) - количество стрелок
        const arrowCount = this.countArrows(card);
        const connectivityScore = arrowCount;

        // Рейтинг Устойчивости (Defense Score)
        const defenseScore = mechanicalDefense + electricalDefense;

        return {
            ...card,
            scores: {
                powerScore,
                connectivityScore,
                defenseScore,
                attackLevel,
                mechanicalDefense,
                electricalDefense,
                arrowCount
            }
        };
    }

    /**
     * Подсчет количества стрелок у карты
     * @param {Object} card - Объект карты
     * @returns {number} - Количество активных стрелок (0-8)
     */
    countArrows(card) {
        const arrowFields = [
            'arrowTopLeft',
            'arrowTop',
            'arrowTopRight',
            'arrowRight',
            'arrowBottomRight',
            'arrowBottom',
            'arrowBottomLeft',
            'arrowLeft'
        ];

        return arrowFields.filter(field => card[field] === true).length;
    }

    /**
     * Получение битовой маски направлений стрелок
     * @param {Object} card - Объект карты
     * @returns {Object} - Объект с флагами направлений
     */
    getArrowDirections(card) {
        return {
            topLeft: card.arrowTopLeft === true,
            top: card.arrowTop === true,
            topRight: card.arrowTopRight === true,
            right: card.arrowRight === true,
            bottomRight: card.arrowBottomRight === true,
            bottom: card.arrowBottom === true,
            bottomLeft: card.arrowBottomLeft === true,
            left: card.arrowLeft === true
        };
    }

    /**
     * Преобразование значения в число
     * @param {*} value - Значение для преобразования
     * @returns {number} - Числовое значение
     */
    parseNumber(value) {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const parsed = parseFloat(value);
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    }

    /**
     * Этап 2: Выбор кандидатов по ролям
     * @param {Array} scoredCards - Карты с рассчитанными рейтингами
     * @returns {Object} - Объект с выбранными картами и резервом
     */
    selectByRoles(scoredCards) {
        const pool = [...scoredCards];
        const selectedCards = [];
        const roles = [];

        // Слот 1: Ударная сила (Striker) - максимальный attackLevel
        const strikerIndex = this.findBestCard(pool, (a, b) => {
            const diff = b.scores.attackLevel - a.scores.attackLevel;
            // При конфликте берем с большим количеством стрелок
            if (diff === 0) return b.scores.arrowCount - a.scores.arrowCount;
            return diff;
        });

        if (strikerIndex !== -1) {
            selectedCards.push(pool[strikerIndex]);
            roles.push('Striker');
            pool.splice(strikerIndex, 1);
        }

        // Слот 2: Танк (Defender) - максимальный defenseScore
        const defenderIndex = this.findBestCard(pool, (a, b) => {
            return b.scores.defenseScore - a.scores.defenseScore;
        });

        if (defenderIndex !== -1) {
            selectedCards.push(pool[defenderIndex]);
            roles.push('Defender');
            pool.splice(defenderIndex, 1);
        }

        // Слот 3: Комбо-мастер (Connector) - максимальное количество стрелок
        const connectorIndex = this.findBestCard(pool, (a, b) => {
            const diff = b.scores.connectivityScore - a.scores.connectivityScore;
            // При конфликте берем с большим powerScore
            if (diff === 0) return b.scores.powerScore - a.scores.powerScore;
            return diff;
        });

        if (connectorIndex !== -1) {
            selectedCards.push(pool[connectorIndex]);
            roles.push('Connector');
            pool.splice(connectorIndex, 1);
        }

        // Слоты 4 и 5: Универсалы (Best Overall) - максимальный powerScore
        for (let i = 0; i < 2 && pool.length > 0; i++) {
            const bestOverallIndex = this.findBestCard(pool, (a, b) => {
                return b.scores.powerScore - a.scores.powerScore;
            });

            if (bestOverallIndex !== -1) {
                selectedCards.push(pool[bestOverallIndex]);
                roles.push('Universal');
                pool.splice(bestOverallIndex, 1);
            }
        }

        return {
            selectedCards,
            roles,
            reserve: pool
        };
    }

    /**
     * Поиск лучшей карты в пуле по компаратору
     * @param {Array} pool - Пул карт
     * @param {Function} comparator - Функция сравнения
     * @returns {number} - Индекс лучшей карты или -1
     */
    findBestCard(pool, comparator) {
        if (pool.length === 0) return -1;

        let bestIndex = 0;
        for (let i = 1; i < pool.length; i++) {
            if (comparator(pool[bestIndex], pool[i]) > 0) {
                bestIndex = i;
            }
        }
        return bestIndex;
    }

    /**
     * Этап 3: Проверка разнообразия
     * @param {Array} selectedCards - Выбранные карты
     * @param {Array} roles - Роли карт
     * @param {Array} reserve - Резервные карты
     * @returns {Object} - Оптимизированный результат
     */
    checkDiversity(selectedCards, roles, reserve) {
        let finalCards = [...selectedCards];
        let finalRoles = [...roles];

        // 3.1 Проверка типов атаки
        finalCards = this.checkAttackTypeDiversity(finalCards, finalRoles, reserve);

        // 3.2 Проверка геометрии стрелок
        finalCards = this.checkArrowGeometry(finalCards, finalRoles, reserve);

        return { finalCards, finalRoles };
    }

    /**
     * Проверка разнообразия типов атаки
     * @param {Array} selectedCards - Выбранные карты
     * @param {Array} roles - Роли карт
     * @param {Array} reserve - Резервные карты
     * @returns {Array} - Оптимизированные карты
     */
    checkAttackTypeDiversity(selectedCards, roles, reserve) {
        const cards = [...selectedCards];

        // Подсчитываем типы атаки
        const attackTypes = {};
        cards.forEach(card => {
            const type = card.attackType || 'Unknown';
            attackTypes[type] = (attackTypes[type] || 0) + 1;
        });

        // Проверяем, все ли карты одного типа
        const types = Object.keys(attackTypes);
        if (types.length === 1 && cards.length >= 5) {
            const dominantType = types[0];

            // Ищем карту другого типа в резерве
            const alternativeIndex = reserve.findIndex(card =>
                card.attackType !== dominantType
            );

            if (alternativeIndex !== -1) {
                const alternativeCard = reserve[alternativeIndex];

                // Находим самую слабую карту в слотах 4-5 (Universal)
                let weakestUniversalIndex = -1;
                let weakestPowerScore = Infinity;

                for (let i = 0; i < cards.length; i++) {
                    if (roles[i] === 'Universal') {
                        if (cards[i].scores.powerScore < weakestPowerScore) {
                            weakestPowerScore = cards[i].scores.powerScore;
                            weakestUniversalIndex = i;
                        }
                    }
                }

                // Заменяем, если альтернативная карта не сильно слабее (порог 85%)
                if (weakestUniversalIndex !== -1) {
                    const threshold = weakestPowerScore * this.config.diversityThreshold;
                    if (alternativeCard.scores.powerScore >= threshold) {
                        console.log(`AutoHandCollector: Замена карты для разнообразия типов атаки`);
                        cards[weakestUniversalIndex] = alternativeCard;
                    }
                }
            }
        }

        return cards;
    }

    /**
     * Проверка геометрии стрелок
     * @param {Array} selectedCards - Выбранные карты
     * @param {Array} roles - Роли карт
     * @param {Array} reserve - Резервные карты
     * @returns {Array} - Оптимизированные карты
     */
    checkArrowGeometry(selectedCards, roles, reserve) {
        const cards = [...selectedCards];

        // Критические направления для проверки (основные 4 направления)
        const criticalDirections = ['top', 'right', 'bottom', 'left'];

        // Подсчитываем стрелки по направлениям
        const arrowCoverage = {
            topLeft: false,
            top: false,
            topRight: false,
            right: false,
            bottomRight: false,
            bottom: false,
            bottomLeft: false,
            left: false
        };

        cards.forEach(card => {
            const directions = this.getArrowDirections(card);
            Object.keys(directions).forEach(dir => {
                if (directions[dir]) arrowCoverage[dir] = true;
            });
        });

        // Проверяем критические пробелы
        for (const direction of criticalDirections) {
            if (!arrowCoverage[direction]) {
                // Ищем карту с этой стрелкой в резерве
                const replacementIndex = this.findCardWithArrow(reserve, direction);

                if (replacementIndex !== -1) {
                    const replacementCard = reserve[replacementIndex];

                    // Находим самого слабого универсала для замены
                    let weakestUniversalIndex = -1;
                    let weakestPowerScore = Infinity;

                    for (let i = 0; i < cards.length; i++) {
                        if (roles[i] === 'Universal') {
                            if (cards[i].scores.powerScore < weakestPowerScore) {
                                weakestPowerScore = cards[i].scores.powerScore;
                                weakestUniversalIndex = i;
                            }
                        }
                    }

                    // Заменяем, если нашли универсала
                    if (weakestUniversalIndex !== -1) {
                        console.log(`AutoHandCollector: Замена карты для покрытия направления "${direction}"`);
                        cards[weakestUniversalIndex] = replacementCard;
                        // Обновляем покрытие
                        const newDirections = this.getArrowDirections(replacementCard);
                        Object.keys(newDirections).forEach(dir => {
                            if (newDirections[dir]) arrowCoverage[dir] = true;
                        });
                    }
                }
            }
        }

        return cards;
    }

    /**
     * Поиск карты с определенной стрелкой
     * @param {Array} reserve - Резерв карт
     * @param {string} direction - Направление стрелки
     * @returns {number} - Индекс карты или -1
     */
    findCardWithArrow(reserve, direction) {
        const arrowField = `arrow${direction.charAt(0).toUpperCase()}${direction.slice(1)}`;

        // Сортируем по powerScore и ищем первую с нужной стрелкой
        const sortedReserve = [...reserve].sort((a, b) =>
            b.scores.powerScore - a.scores.powerScore
        );

        for (let i = 0; i < sortedReserve.length; i++) {
            if (sortedReserve[i][arrowField] === true) {
                return reserve.indexOf(sortedReserve[i]);
            }
        }

        return -1;
    }

    /**
     * Этап 4: Главная функция сбора руки
     * @param {Array} cards - Входной массив карт из колоды
     * @returns {Array} - Массив из 5 отобранных карт (только id)
     */
    collectHand(cards) {
        if (!Array.isArray(cards) || cards.length === 0) {
            console.error('AutoHandCollector: Пустой или некорректный массив карт');
            return [];
        }

        if (cards.length < this.config.handSize) {
            console.warn(`AutoHandCollector: В колоде меньше ${this.config.handSize} карт, возвращаем все`);
            return cards.map(card => ({ id: card.id }));
        }

        // Этап 1: Расчет рейтингов
        const scoredCards = cards.map(card => this.calculateScores(card));

        // Этап 2: Выбор по ролям
        const { selectedCards, roles, reserve } = this.selectByRoles(scoredCards);

        // Этап 3: Проверка разнообразия
        const { finalCards } = this.checkDiversity(selectedCards, roles, reserve);

        // Этап 4: Возврат результата (только id)
        return finalCards.map(card => ({ id: card.id }));
    }

    /**
     * Расширенная версия сбора руки с подробным логом
     * @param {Array} cards - Входной массив карт из колоды
     * @returns {Object} - Подробный результат с логом
     */
    collectHandVerbose(cards) {
        if (!Array.isArray(cards) || cards.length === 0) {
            return { error: 'Пустой или некорректный массив карт', hand: [] };
        }

        console.log('=== AutoHandCollector: Начало сбора руки ===');
        console.log(`Входных карт: ${cards.length}`);

        if (cards.length < this.config.handSize) {
            console.warn(`В колоде меньше ${this.config.handSize} карт`);
            return {
                hand: cards.map(card => ({ id: card.id })),
                details: {
                    inputCount: cards.length,
                    warning: 'Недостаточно карт для полной руки'
                }
            };
        }

        // Этап 1: Расчет рейтингов
        console.log('\n--- Этап 1: Расчет рейтингов ---');
        const scoredCards = cards.map(card => {
            const scored = this.calculateScores(card);
            console.log(`Карта ID=${card.id}: Power=${scored.scores.powerScore.toFixed(1)}, ` +
                       `Connectivity=${scored.scores.connectivityScore}, ` +
                       `Defense=${scored.scores.defenseScore}, ` +
                       `Attack=${scored.scores.attackLevel} (${card.attackType || 'N/A'})`);
            return scored;
        });

        // Этап 2: Выбор по ролям
        console.log('\n--- Этап 2: Выбор по ролям ---');
        const { selectedCards, roles, reserve } = this.selectByRoles(scoredCards);

        selectedCards.forEach((card, index) => {
            console.log(`Слот ${index + 1} (${roles[index]}): Карта ID=${card.id}, ` +
                       `Power=${card.scores.powerScore.toFixed(1)}`);
        });
        console.log(`В резерве: ${reserve.length} карт`);

        // Этап 3: Проверка разнообразия
        console.log('\n--- Этап 3: Проверка разнообразия ---');
        const { finalCards, finalRoles } = this.checkDiversity(selectedCards, roles, reserve);

        // Этап 4: Формирование результата
        console.log('\n--- Этап 4: Финальная рука ---');
        const result = finalCards.map((card, index) => {
            console.log(`${index + 1}. ID=${card.id} (${finalRoles[index]}): ` +
                       `Attack=${card.scores.attackLevel}, ` +
                       `Type=${card.attackType || 'N/A'}, ` +
                       `Arrows=${card.scores.arrowCount}`);
            return { id: card.id };
        });

        console.log('\n=== AutoHandCollector: Сбор завершен ===');

        return {
            hand: result,
            details: {
                inputCount: cards.length,
                selectedCards: finalCards.map((card, index) => ({
                    id: card.id,
                    role: finalRoles[index],
                    scores: card.scores
                })),
                reserveCount: reserve.length
            }
        };
    }

    /**
     * Получение текущей конфигурации
     * @returns {Object} - Конфигурация алгоритма
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Обновление конфигурации
     * @param {Object} newConfig - Новые параметры конфигурации
     */
    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('AutoHandCollector: Конфигурация обновлена', this.config);
    }
}

// Создаем глобальный экземпляр и привязываем к window
const autoHandCollector = new AutoHandCollector();
window.autoHandCollector = autoHandCollector;

// Для удобства добавляем алиас
window.collectHand = (cards) => autoHandCollector.collectHand(cards);

console.log('AutoHandCollector: Модуль загружен. Используйте autoHandCollector.collectHand(cards) для сбора руки.');
