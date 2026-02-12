/**
 * AiAttackSelector Module for Technomaster
 * Модуль выбора цели атаки для ИИ при множественной битве.
 */

const aiAttackSelector = (() => {
    const arrowFields = {
        topLeft: 'arrowTopLeft',
        top: 'arrowTop',
        topRight: 'arrowTopRight',
        right: 'arrowRight',
        bottomRight: 'arrowBottomRight',
        bottom: 'arrowBottom',
        bottomLeft: 'arrowBottomLeft',
        left: 'arrowLeft'
    };

    function parseStat(value) {
        const multiplier = window.GameConfig?.statMultiplier ?? 16;
        if (typeof value === 'number' && Number.isFinite(value)) {
            if (Number.isInteger(value) && value >= 0 && value <= 15) {
                return value * multiplier + 8;
            }
            return value;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (/^[0-9a-f]$/i.test(trimmed)) {
                return parseInt(trimmed, 16) * multiplier + 8;
            }
            if (/^0x[0-9a-f]+$/i.test(trimmed)) {
                return parseInt(trimmed, 16);
            }
            const parsed = Number.parseFloat(trimmed);
            if (Number.isFinite(parsed)) {
                if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 15) {
                    return parsed * multiplier + 8;
                }
                return parsed;
            }
        }

        return 0;
    }

    function countArrows(card) {
        return Object.values(arrowFields).filter(field => card[field] === true).length;
    }

    function countComboPotential(target, context) {
        const enemyOwner = context?.enemyOwner || 'player';
        const neighbors = Array.isArray(target.neighbors) ? target.neighbors : null;

        if (!neighbors) {
            return countArrows(target);
        }

        return neighbors.reduce((count, neighbor) => {
            const direction = neighbor.direction;
            const fieldName = arrowFields[direction];
            if (!fieldName || target[fieldName] !== true) {
                return count;
            }

            const isEnemy = typeof neighbor.isEnemy === 'boolean'
                ? neighbor.isEnemy
                : neighbor.owner === enemyOwner;

            return isEnemy ? count + 1 : count;
        }, 0);
    }

    function resolveDefenseValue(attacker, target) {
        const mechanicalDefense = parseStat(target.mechanicalDefense);
        const electricalDefense = parseStat(target.electricalDefense);
        const targetAttackLevel = parseStat(target.attackLevel);

        switch (attacker.attackType) {
            case 'P':
                return mechanicalDefense;
            case 'E':
            case 'M':
                return electricalDefense;
            case 'X':
                return Math.min(mechanicalDefense, electricalDefense);
            case 'A':
                return Math.min(mechanicalDefense, electricalDefense, targetAttackLevel);
            default:
                return mechanicalDefense;
        }
    }

    function selectAiAttackTarget(context) {
        if (!context || !context.attacker || !Array.isArray(context.targets)) {
            return null;
        }

        const attackerValue = parseStat(context.attacker.attackLevel);
        let bestTargetId = null;
        let bestScore = -Infinity;

        context.targets.forEach(target => {
            const defenseValue = resolveDefenseValue(context.attacker, target);
            const winScore = attackerValue - defenseValue;
            const comboScore = countComboPotential(target, context);
            const totalWeight = (winScore * 10) + comboScore;

            if (totalWeight > bestScore) {
                bestScore = totalWeight;
                bestTargetId = target.id;
            }
        });

        return bestTargetId;
    }

    return {
        selectAiAttackTarget,
        parseStat,
        countComboPotential,
        resolveDefenseValue
    };
})();

window.aiAttackSelector = aiAttackSelector;
window.selectAiAttackTarget = aiAttackSelector.selectAiAttackTarget;

console.log('AiAttackSelector: Модуль загружен. Используйте aiAttackSelector.selectAiAttackTarget(context).');
