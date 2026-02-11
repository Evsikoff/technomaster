/**
 * AiMoveCalculator Module for Technomaster
 * Модуль расчёта оптимального хода ИИ (карта + клетка).
 */

const aiMoveCalculator = (() => {
    const directions = [
        { name: 'topLeft', rowDelta: -1, colDelta: -1, arrowField: 'arrowTopLeft', opposite: 'bottomRight' },
        { name: 'top', rowDelta: -1, colDelta: 0, arrowField: 'arrowTop', opposite: 'bottom' },
        { name: 'topRight', rowDelta: -1, colDelta: 1, arrowField: 'arrowTopRight', opposite: 'bottomLeft' },
        { name: 'right', rowDelta: 0, colDelta: 1, arrowField: 'arrowRight', opposite: 'left' },
        { name: 'bottomRight', rowDelta: 1, colDelta: 1, arrowField: 'arrowBottomRight', opposite: 'topLeft' },
        { name: 'bottom', rowDelta: 1, colDelta: 0, arrowField: 'arrowBottom', opposite: 'top' },
        { name: 'bottomLeft', rowDelta: 1, colDelta: -1, arrowField: 'arrowBottomLeft', opposite: 'topRight' },
        { name: 'left', rowDelta: 0, colDelta: -1, arrowField: 'arrowLeft', opposite: 'right' }
    ];

    const cornerIndices = new Set([0, 3, 12, 15]);

    function getStatValue(value) {
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

    function getCardOwner(card) {
        if (!card) {
            return null;
        }
        if (card.owner) {
            return card.owner;
        }
        if (card.ownership === 'rival') {
            return 'opponent';
        }
        if (card.ownership) {
            return card.ownership;
        }
        return null;
    }

    function buildCellMap(fieldState) {
        const cellMap = new Map();
        if (!fieldState || !Array.isArray(fieldState.cells)) {
            return cellMap;
        }
        fieldState.cells.forEach(cell => {
            if (!cell) {
                return;
            }
            const row = Number.isFinite(cell.row) ? cell.row : Math.floor(cell.index / 4);
            const col = Number.isFinite(cell.col) ? cell.col : cell.index % 4;
            cellMap.set(cell.index, { ...cell, row, col });
        });
        return cellMap;
    }

    function getNeighborCell(cell, direction, cellMap) {
        const row = cell.row + direction.rowDelta;
        const col = cell.col + direction.colDelta;
        if (row < 0 || row > 3 || col < 0 || col > 3) {
            return null;
        }
        const index = row * 4 + col;
        return cellMap.get(index) || null;
    }

    function getNeighbors(cell, cellMap) {
        return directions
            .map(direction => ({
                direction,
                cell: getNeighborCell(cell, direction, cellMap)
            }))
            .filter(item => item.cell);
    }

    function hasArrow(card, direction) {
        return Boolean(card && card[direction.arrowField]);
    }

    function checkArrowRelation(attacker, defender, direction) {
        if (!hasArrow(attacker, direction)) {
            return 'none';
        }
        const oppositeDirection = directions.find(item => item.name === direction.opposite);
        const defenderHasArrow = oppositeDirection && hasArrow(defender, oppositeDirection);
        if (!defenderHasArrow) {
            return 'capture';
        }
        return 'battle';
    }

    function resolveDefenseValue(attacker, target) {
        const mechanicalDefense = getStatValue(target.mechanicalDefense);
        const electricalDefense = getStatValue(target.electricalDefense);
        const targetAttackLevel = getStatValue(target.attackLevel);

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

    function calculateWinProbability(attacker, defender) {
        const attackValue = getStatValue(attacker.attackLevel);
        const defenseValue = resolveDefenseValue(attacker, defender);
        const total = attackValue + defenseValue;

        if (total <= 0) {
            return 0.5;
        }

        const ratio = attackValue / total;
        return Math.max(0, Math.min(1, ratio));
    }

    function calculateComboPotential(startIndex, fieldState, aiOwner, depth, virtualOwners) {
        if (depth > 5) {
            return 0;
        }

        const cellMap = buildCellMap(fieldState);
        const startCell = cellMap.get(startIndex);
        if (!startCell || !startCell.card) {
            return 0;
        }

        let score = 0;
        const neighbors = getNeighbors(startCell, cellMap);

        neighbors.forEach(({ direction, cell }) => {
            if (!cell.card) {
                return;
            }

            const ownerOverride = virtualOwners?.get(cell.index);
            const neighborOwner = ownerOverride || getCardOwner(cell.card);
            if (neighborOwner === aiOwner) {
                return;
            }

            const relation = checkArrowRelation(startCell.card, cell.card, direction);
            if (relation !== 'capture' && relation !== 'battle') {
                return;
            }

            const winChance = relation === 'battle'
                ? calculateWinProbability(startCell.card, cell.card)
                : 1;

            if (relation === 'battle' && winChance < 0.3) {
                return;
            }

            if (depth === 2) {
                score += 60;
            } else if (depth === 3) {
                score += 80;
            } else if (depth >= 4) {
                score += 100;
            }

            if (depth < 5) {
                const nextVirtual = new Map(virtualOwners || []);
                nextVirtual.set(cell.index, aiOwner);
                score += calculateComboPotential(cell.index, fieldState, aiOwner, depth + 1, nextVirtual);
            }
        });

        return score;
    }

    function getCardStrength(card) {
        return (
            getStatValue(card.attackLevel)
            + getStatValue(card.mechanicalDefense)
            + getStatValue(card.electricalDefense)
        );
    }

    function isCardAvailable(card) {
        if (!card) {
            return false;
        }
        if (card.used) {
            return false;
        }
        if (card.inHand === false) {
            return false;
        }
        return true;
    }

    function evaluateMove(card, cell, fieldState, context) {
        const cellMap = buildCellMap(fieldState);
        const currentCell = cellMap.get(cell.index);
        if (!currentCell) {
            return -Infinity;
        }

        const aiOwner = context.aiOwner || 'opponent';
        let score = 0;
        let captureCount = 0;

        const neighbors = getNeighbors(currentCell, cellMap);

        neighbors.forEach(({ direction, cell: neighborCell }) => {
            if (!neighborCell.card) {
                return;
            }

            const neighborOwner = getCardOwner(neighborCell.card);
            if (neighborOwner === aiOwner) {
                return;
            }

            const relation = checkArrowRelation(card, neighborCell.card, direction);
            if (relation === 'capture') {
                score += 100;
                captureCount += 1;
                score += calculateComboPotential(neighborCell.index, fieldState, aiOwner, 2, new Map([[neighborCell.index, aiOwner]]));
            } else if (relation === 'battle') {
                const winChance = calculateWinProbability(card, neighborCell.card);
                score += winChance * 100;

                if (winChance < 0.2) {
                    score -= 30;
                }

                if (winChance >= 0.5) {
                    captureCount += 1;
                    const comboScore = calculateComboPotential(
                        neighborCell.index,
                        fieldState,
                        aiOwner,
                        2,
                        new Map([[neighborCell.index, aiOwner]])
                    );
                    score += comboScore * winChance;
                }
            }
        });

        // SafetyScore
        directions.forEach(direction => {
            const hasArrowSide = hasArrow(card, direction);
            const neighborCell = getNeighborCell(currentCell, direction, cellMap);

            if (!hasArrowSide) {
                if (neighborCell && neighborCell.isAvailable && !neighborCell.card) {
                    score -= 30;
                } else {
                    score += 10;
                }
            } else if (neighborCell && neighborCell.isAvailable && !neighborCell.card) {
                score += 5;
            }
        });

        // StrategicBonus
        const cardStrength = getCardStrength(card);
        if (captureCount >= 2) {
            score += cardStrength / 10;
        }

        if (cornerIndices.has(currentCell.index)) {
            const outwardDirections = directions.filter(direction => {
                const neighbor = getNeighborCell(currentCell, direction, cellMap);
                return !neighbor;
            });
            const outwardArrows = outwardDirections.filter(direction => hasArrow(card, direction));
            if (outwardArrows.length >= 2) {
                score += 20;
            }
        }

        return score;
    }

    function calculateAiMove(fieldState, aiHand, opponentHand) {
        if (!fieldState || !Array.isArray(fieldState.cells) || !Array.isArray(aiHand)) {
            return { cardId: null, cellIndex: null };
        }

        const availableCards = aiHand.filter(isCardAvailable);
        const maxStrength = availableCards.reduce((max, card) => Math.max(max, getCardStrength(card)), 0);

        let bestMove = { cardId: null, cellIndex: null };
        let maxScore = -Infinity;

        fieldState.cells.forEach(cell => {
            if (!cell.isAvailable || cell.card) {
                return;
            }

            availableCards.forEach(card => {
                const score = evaluateMove(card, cell, fieldState, {
                    aiOwner: 'opponent',
                    maxStrength,
                    opponentHand
                });

                if (score > maxScore) {
                    maxScore = score;
                    bestMove = { cardId: card.id, cellIndex: cell.index };
                }
            });
        });

        return bestMove;
    }

    return {
        calculateAiMove,
        evaluateMove,
        calculateWinProbability,
        getStatValue
    };
})();

window.aiMoveCalculator = aiMoveCalculator;
window.calculateAiMove = aiMoveCalculator.calculateAiMove;

console.log('AiMoveCalculator: Модуль загружен. Используйте aiMoveCalculator.calculateAiMove(state, hand).');
