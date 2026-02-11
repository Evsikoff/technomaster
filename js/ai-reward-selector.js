/**
 * AiRewardSelector Module for Technomaster
 * Модуль выбора карты игрока, которую заберет ИИ после победы.
 */

const aiRewardSelector = (() => {
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

    function getRealStatValue(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            if (Number.isInteger(value) && value >= 0 && value <= 15) {
                return value * 16;
            }
            return value;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (/^[0-9a-f]$/i.test(trimmed)) {
                return parseInt(trimmed, 16) * 16;
            }
            if (/^0x[0-9a-f]+$/i.test(trimmed)) {
                return parseInt(trimmed, 16);
            }
            const parsed = Number.parseFloat(trimmed);
            if (Number.isFinite(parsed)) {
                if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 15) {
                    return parsed * 16;
                }
                return parsed;
            }
        }

        return 0;
    }

    function countArrows(card) {
        return arrowFields.filter(field => card[field] === true).length;
    }

    function computeCardScore(card) {
        const attack = getRealStatValue(card.attackLevel);
        const mechanicalDefense = getRealStatValue(card.mechanicalDefense);
        const electricalDefense = getRealStatValue(card.electricalDefense);

        const statScore = attack + mechanicalDefense + electricalDefense;
        const arrowScore = countArrows(card) * 20;

        let typeBonus = 0;
        if (card.attackType === 'A') {
            typeBonus = 100;
        } else if (card.attackType === 'X') {
            typeBonus = 50;
        }

        return {
            totalValue: statScore + arrowScore * 0.5 + typeBonus * 0.2,
            attack
        };
    }

    /**
     * Выбирает карту для кражи у игрока.
     * @param {Array} candidateCards - Массив карт игрока, участвовавших в партии.
     * @returns {number|null} ID выбранной карты.
     */
    function selectAiRewardCard(candidateCards) {
        if (!Array.isArray(candidateCards) || candidateCards.length === 0) {
            return null;
        }

        let bestCard = null;
        let maxScore = -Infinity;

        candidateCards.forEach(card => {
            const { totalValue, attack } = computeCardScore(card);

            if (totalValue > maxScore) {
                maxScore = totalValue;
                bestCard = card;
                return;
            }

            if (totalValue === maxScore && bestCard) {
                const bestAttack = getRealStatValue(bestCard.attackLevel);
                if (attack > bestAttack) {
                    bestCard = card;
                }
            }
        });

        return bestCard ? bestCard.id : null;
    }

    return {
        selectAiRewardCard,
        computeCardScore,
        countArrows,
        getRealStatValue
    };
})();

window.aiRewardSelector = aiRewardSelector;
window.selectAiRewardCard = aiRewardSelector.selectAiRewardCard;

console.log('AiRewardSelector: Модуль загружен. Используйте aiRewardSelector.selectAiRewardCard(cards).');
