/**
 * Party Game Orchestrator for Technomaster
 * Центральный управляющий модуль игровой партии.
 * Контролирует ход игры, соблюдение правил, расчет битв/комбинаций,
 * искусственный интеллект противника и коммуникацию с экраном партии.
 */

const partyGameOrchestrator = (() => {
    // === Константы ===
    const PLAYER_CARDHOLDER_ID = 1;
    const LEVEL_UP_CHANCE = 0.1;
    const MAX_CARD_LEVEL = 2;
    const AI_MOVE_DELAY_MIN = 1000;
    const AI_MOVE_DELAY_MAX = 1500;

    // === Направления и их свойства стрелок ===
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

    // === Глобальное состояние оркестратора ===
    const state = {
        // Данные партии
        opponentId: null,
        opponentData: null,
        playerHand: [],
        opponentHand: [],

        // Состояние поля
        fieldState: null,
        fieldCells: [],
        unavailableCells: [],

        // Текущий ход
        currentTurn: null, // 'player' | 'rival'
        turnNumber: 0,

        // История ходов
        gameHistory: [],

        // Статус игры
        isGameActive: false,
        isProcessingMove: false,

        // Результаты боев текущего хода
        currentMoveBattles: [],
        pendingCaptures: [],

        // Режим игры
        gameMode: 'standard',

        // Ссылка на экран
        screenApi: null
    };

    // === Вспомогательные функции ===

    /**
     * Получение числового значения характеристики
     */
    function getStatValue(value) {
        const multiplier = window.GameConfig?.statMultiplier ?? 16;
        if (typeof value === 'number' && Number.isFinite(value)) {
            if (Number.isInteger(value) && value >= 0 && value <= 15) {
                return value * multiplier;
            }
            return value;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (/^[0-9a-f]$/i.test(trimmed)) {
                return parseInt(trimmed, 16) * multiplier;
            }
            if (/^0x[0-9a-f]+$/i.test(trimmed)) {
                return parseInt(trimmed, 16);
            }
            const parsed = Number.parseFloat(trimmed);
            if (Number.isFinite(parsed)) {
                if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 15) {
                    return parsed * multiplier;
                }
                return parsed;
            }
        }

        return 0;
    }

    /**
     * Задержка выполнения
     */
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Случайная задержка для AI
     */
    function getAiDelay() {
        return AI_MOVE_DELAY_MIN + Math.random() * (AI_MOVE_DELAY_MAX - AI_MOVE_DELAY_MIN);
    }

    /**
     * Получение ячейки по индексу
     */
    function getCellByIndex(index) {
        if (!state.fieldState || !state.fieldState.cells) {
            return null;
        }
        return state.fieldState.cells.find(c => c.index === index) || null;
    }

    /**
     * Получение соседней ячейки по направлению
     */
    function getNeighborCell(cell, direction) {
        const row = cell.row + direction.rowDelta;
        const col = cell.col + direction.colDelta;

        if (row < 0 || row > 3 || col < 0 || col > 3) {
            return null;
        }

        const index = row * 4 + col;
        return getCellByIndex(index);
    }

    /**
     * Определение владельца карты
     */
    function getCardOwner(card) {
        if (!card) return null;
        if (card.owner) return card.owner;
        if (card.ownership === 'rival') return 'opponent';
        if (card.ownership === 'player') return 'player';
        return null;
    }

    /**
     * Проверка, является ли карта вражеской
     */
    function isEnemyCard(card, currentOwner) {
        const cardOwner = getCardOwner(card);
        if (!cardOwner) return false;
        return cardOwner !== currentOwner;
    }

    /**
     * Получение защиты в зависимости от типа атаки
     */
    function resolveDefenseValue(attacker, defender) {
        const mechanicalDefense = getStatValue(defender.mechanicalDefense);
        const electricalDefense = getStatValue(defender.electricalDefense);
        const defenderAttack = getStatValue(defender.attackLevel);

        switch (attacker.attackType) {
            case 'P':
                return mechanicalDefense;
            case 'E':
            case 'M':
                return electricalDefense;
            case 'X':
                return Math.min(mechanicalDefense, electricalDefense);
            case 'A':
                return Math.min(mechanicalDefense, electricalDefense, defenderAttack);
            default:
                return mechanicalDefense;
        }
    }

    // === Этап 0: Инициализация ===

    /**
     * Запуск оркестратора
     */
    async function start(initialState) {
        console.log('PartyGameOrchestrator: Запуск оркестратора');

        // Сохраняем ссылку на API экрана
        state.screenApi = window.partyScreen;

        // Инициализируем состояние из данных экрана
        if (initialState) {
            state.playerHand = initialState.playerHand || [];
            state.opponentHand = initialState.opponentHand || [];
            state.unavailableCells = initialState.unavailableCells || [];

            // Сохраняем данные оппонента из initialState (если переданы)
            if (initialState.opponentData) {
                state.opponentData = initialState.opponentData;
            }

            // Инициализируем fieldState из fieldCells
            if (initialState.fieldCells && initialState.fieldCells.length > 0) {
                state.fieldState = {
                    cells: initialState.fieldCells.map(c => ({
                        index: c.index,
                        row: c.row !== undefined ? c.row : Math.floor(c.index / 4),
                        col: c.col !== undefined ? c.col : c.index % 4,
                        isAvailable: c.isAvailable,
                        card: c.card || null
                    }))
                };
            }
        }

        // Получаем данные партии из sessionStorage
        const payload = getPartyPayload();
        if (payload) {
            state.opponentId = payload.opponentId;
            state.playerHand = payload.playerHand || [];
            state.opponentHand = payload.opponentHand || [];
            state.gameMode = payload.gameMode || 'standard';
            console.log('PartyGameOrchestrator: Режим игры -', state.gameMode);
        }

        // Получаем данные оппонента
        if (state.opponentId && window.partyScreen) {
            state.opponentData = await getOpponentData(state.opponentId);
        }

        // Синхронизируем состояние поля
        syncFieldState();

        // Запускаем игру
        state.isGameActive = true;
        state.turnNumber = 0;

        // Определяем первый ход
        let coinFlip;
        let firstTurnMessage;

        if (state.gameMode === 'hardcore') {
            coinFlip = true; // Игрок всегда первый в хардкоре
            state.currentTurn = 'player';
            firstTurnMessage = 'Режим ХАРДКОР: Вы всегда ходите первым!';
        } else {
            // Определяем первый ход случайным образом (50/50)
            coinFlip = Math.random() < 0.5;
            state.currentTurn = coinFlip ? 'player' : 'rival';
            firstTurnMessage = coinFlip
                ? 'Орёл или Решка? Первый ход за Вами!'
                : 'Орёл или Решка? Первый ход за Соперником!';
        }

        addSystemMessage(firstTurnMessage);

        // Логируем в историю
        logGameEvent('game_start', { firstTurn: state.currentTurn });

        // Сохраняем снимок активной партии в персистентное хранилище
        await saveActivePartySnapshot();

        // Задержка перед первым ходом
        await delay(1500);

        // Начинаем первый ход
        if (state.currentTurn === 'player') {
            await startPlayerTurn();
        } else {
            await startRivalTurn();
        }
    }

    /**
     * Получение данных партии из sessionStorage
     */
    function getPartyPayload() {
        const payloadKey = 'technomaster.party.payload';
        const raw = sessionStorage.getItem(payloadKey);

        if (!raw) return null;

        try {
            return JSON.parse(raw);
        } catch (error) {
            console.error('PartyGameOrchestrator: Ошибка чтения данных партии', error);
            return null;
        }
    }

    /**
     * Получение данных оппонента
     */
    async function getOpponentData(opponentId) {
        // Используем API экрана, если доступен
        if (state.screenApi?.getState) {
            const screenState = state.screenApi.getState();
            if (screenState.opponentData) {
                return screenState.opponentData;
            }
        }
        return { id: opponentId, name: 'Соперник', sequence: 1 };
    }

    /**
     * Синхронизация состояния поля с экраном
     */
    function syncFieldState() {
        if (state.screenApi?.getState) {
            const screenState = state.screenApi.getState();

            // fieldCells уже содержит card из Map, используем напрямую
            if (screenState.fieldCells && screenState.fieldCells.length > 0) {
                state.fieldState = {
                    cells: screenState.fieldCells.map(c => ({
                        index: c.index,
                        row: c.row !== undefined ? c.row : Math.floor(c.index / 4),
                        col: c.col !== undefined ? c.col : c.index % 4,
                        isAvailable: c.isAvailable,
                        card: c.card || null
                    }))
                };
            }

            state.unavailableCells = screenState.unavailableCells || [];
            state.playerHand = screenState.playerHand || state.playerHand;
            state.opponentHand = screenState.opponentHand || state.opponentHand;
        }

        console.log('PartyGameOrchestrator: syncFieldState - cells:', state.fieldState?.cells?.length,
            'cardsOnField:', state.fieldState?.cells?.filter(c => c.card).length);
    }

    // === Этап 1: Ход Игрока ===

    /**
     * Начало хода игрока
     */
    async function startPlayerTurn() {
        state.turnNumber++;
        state.currentTurn = 'player';

        addSystemMessage('Ваш ход. Выберите карту и место на поле.');

        if (state.screenApi?.setMode) {
            state.screenApi.setMode('player_turn');
        }

        logGameEvent('turn_start', { turn: 'player', turnNumber: state.turnNumber });
    }

    /**
     * Обработка хода игрока (вызывается из экрана)
     */
    async function onPlayerMove(moveData) {
        if (state.currentTurn !== 'player' || state.isProcessingMove) {
            console.warn('PartyGameOrchestrator: Некорректный вызов onPlayerMove');
            return;
        }

        state.isProcessingMove = true;

        try {
            const { cellIndex, cardId, cardData } = moveData;

            // Находим карту в руке игрока
            const card = cardData || state.playerHand.find(c => c.id === cardId);
            if (!card) {
                console.error('PartyGameOrchestrator: Карта не найдена');
                state.isProcessingMove = false;
                return;
            }

            // Синхронизируем состояние поля
            syncFieldState();

            // Обновляем состояние: размещаем карту
            const cell = getCellByIndex(cellIndex);
            if (cell) {
                cell.card = { ...card, owner: 'player' };
            }

            // Помечаем карту как использованную
            const handCard = state.playerHand.find(c => c.id === cardId);
            if (handCard) {
                handCard.used = true;
            }

            // Логируем ход
            logGameEvent('player_move', { cardId, cellIndex, card });

            // Переходим к расчету последствий
            await processMoveConsequences(cellIndex, 'player');

        } finally {
            state.isProcessingMove = false;
        }
    }

    // === Этап 2: Ход Компьютера ===

    /**
     * Начало хода компьютера
     */
    async function startRivalTurn() {
        state.turnNumber++;
        state.currentTurn = 'rival';

        addSystemMessage('Ход соперника...');

        if (state.screenApi?.setMode) {
            state.screenApi.setMode('events');
        }

        // Синхронизируем состояние
        syncFieldState();

        // Эмуляция "раздумий" AI
        await delay(getAiDelay());

        // Вызываем AI для расчета хода
        const aiMove = calculateAiMove();

        if (!aiMove || aiMove.cardId === null || aiMove.cellIndex === null) {
            console.log('PartyGameOrchestrator: AI не смог выбрать ход');
            await checkGameEnd();
            return;
        }

        // Находим карту
        const card = state.opponentHand.find(c => c.id === aiMove.cardId);
        if (!card) {
            console.error('PartyGameOrchestrator: AI выбрал несуществующую карту');
            await checkGameEnd();
            return;
        }

        // Логируем ход AI
        logGameEvent('rival_move', { cardId: aiMove.cardId, cellIndex: aiMove.cellIndex, card });

        // Визуализируем ход оппонента
        await visualizeOpponentMove(card, aiMove.cellIndex);

        // Обновляем состояние
        const cell = getCellByIndex(aiMove.cellIndex);
        if (cell) {
            cell.card = { ...card, owner: 'opponent' };
        }

        // Помечаем карту как использованную
        card.used = true;

        // Переходим к расчету последствий
        await processMoveConsequences(aiMove.cellIndex, 'opponent');
    }

    /**
     * Вызов AI калькулятора
     */
    function calculateAiMove() {
        if (!window.aiMoveCalculator?.calculateAiMove) {
            console.warn('PartyGameOrchestrator: AI калькулятор недоступен');
            return fallbackAiMove();
        }

        return window.aiMoveCalculator.calculateAiMove(
            state.fieldState,
            state.opponentHand.filter(c => !c.used),
            state.playerHand.filter(c => !c.used)
        );
    }

    /**
     * Резервный алгоритм AI (простой)
     */
    function fallbackAiMove() {
        const availableCards = state.opponentHand.filter(c => !c.used);
        const emptyCells = state.fieldState?.cells?.filter(c => c.isAvailable && !c.card) || [];

        if (availableCards.length === 0 || emptyCells.length === 0) {
            return { cardId: null, cellIndex: null };
        }

        const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
        const randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];

        return { cardId: randomCard.id, cellIndex: randomCell.index };
    }

    /**
     * Визуализация хода оппонента
     */
    async function visualizeOpponentMove(card, cellIndex) {
        if (state.screenApi?.handleEvent) {
            await state.screenApi.handleEvent({
                type: 'opponent_move',
                cellIndex: cellIndex,
                cardData: { ...card, owner: 'opponent' }
            });
        }

        // Синхронизируем состояние после визуализации
        syncFieldState();
    }

    // === Этап 3: Расчет последствий хода ===

    /**
     * Обработка последствий хода (для обоих игроков)
     */
    async function processMoveConsequences(cellIndex, owner) {
        // Синхронизируем состояние
        syncFieldState();

        // Шаг 3.1-3.2: Анализ соседей и классификация конфликтов
        const conflicts = analyzeNeighbors(cellIndex, owner);

        console.log('PartyGameOrchestrator: Конфликты:', conflicts);

        // Разделяем захваты и битвы
        const captures = conflicts.filter(c => c.type === 'capture');
        const battles = conflicts.filter(c => c.type === 'battle');

        // Флаг: проиграл ли атакующий битву
        let attackerLostBattle = false;

        // Сначала обрабатываем битвы (показываем анимацию боя)
        // Результаты битв (захваты) собираем для последующего комбо
        const battleCapturedCells = [];
        if (battles.length > 0) {
            const battleResult = await processBattles(battles, cellIndex, owner);
            if (battleResult.attackerLost) {
                // Атакующий проиграл битву - его карта перешла к противнику
                // Мгновенные захваты и комбо НЕ происходят
                attackerLostBattle = true;
                console.log('PartyGameOrchestrator: Атакующий проиграл битву, захваты отменены');
            } else if (battleResult.capturedCells.length > 0) {
                battleCapturedCells.push(...battleResult.capturedCells);
            }
        }

        // Мгновенные захваты и комбо происходят только если атакующий НЕ проиграл битву
        if (!attackerLostBattle) {
            // Потом обрабатываем мгновенные захваты (без боя)
            const instantCapturedCells = [];
            if (captures.length > 0) {
                const captured = await processInstantCaptures(captures, owner);
                instantCapturedCells.push(...captured);
            }

            // Теперь запускаем комбо для всех захваченных карт
            // В сложном режиме удары в спину (instantCapturedCells) не вызывают комбо
            let comboStarters = [];
            if (state.gameMode === 'hard') {
                comboStarters = [...battleCapturedCells];
                if (instantCapturedCells.length > 0) {
                    console.log('PartyGameOrchestrator: Сложный режим - удары в спину не вызывают комбо');
                }
            } else {
                comboStarters = [...battleCapturedCells, ...instantCapturedCells];
            }

            if (comboStarters.length > 0) {
                await processComboChain(comboStarters, owner);
            }
        }

        // Этап 4: Проверка окончания игры
        await checkGameEnd();
    }

    /**
     * Шаг 3.1-3.2: Анализ соседей
     */
    function analyzeNeighbors(cellIndex, owner) {
        const cell = getCellByIndex(cellIndex);
        if (!cell || !cell.card) {
            return [];
        }

        const activeCard = cell.card;
        const conflicts = [];

        directions.forEach(direction => {
            const neighborCell = getNeighborCell(cell, direction);

            // Пропускаем пустые или отсутствующие ячейки
            if (!neighborCell || !neighborCell.card) {
                return;
            }

            const neighborCard = neighborCell.card;
            const neighborOwner = getCardOwner(neighborCard);

            // Нас интересуют только враги
            if (!isEnemyCard(neighborCard, owner)) {
                return;
            }

            // Проверяем активную стрелку (у только что поставленной карты)
            const hasActiveArrow = activeCard[direction.activeArrow] === true;

            if (!hasActiveArrow) {
                // Нет активной стрелки - конфликта нет
                return;
            }

            // Проверяем реактивную стрелку (у соседа)
            const hasReactiveArrow = neighborCard[direction.reactiveArrow] === true;

            if (!hasReactiveArrow) {
                // Есть активная, нет реактивной - мгновенный захват
                conflicts.push({
                    type: 'capture',
                    direction: direction,
                    defenderCellIndex: neighborCell.index,
                    defenderCard: neighborCard,
                    defenderOwner: neighborOwner
                });
            } else {
                // Обе стрелки - битва
                conflicts.push({
                    type: 'battle',
                    direction: direction,
                    defenderCellIndex: neighborCell.index,
                    defenderCard: neighborCard,
                    defenderOwner: neighborOwner
                });
            }
        });

        return conflicts;
    }

    /**
     * Обработка мгновенных захватов (без боя)
     * Возвращает массив индексов захваченных ячеек для последующего комбо
     */
    async function processInstantCaptures(captures, newOwner) {
        const capturedCells = [];

        for (const capture of captures) {
            const defenderCell = getCellByIndex(capture.defenderCellIndex);
            if (!defenderCell || !defenderCell.card) continue;

            // Меняем владельца
            defenderCell.card.owner = newOwner;
            defenderCell.card.ownership = newOwner === 'player' ? 'player' : 'rival';

            capturedCells.push(capture.defenderCellIndex);

            logGameEvent('capture', {
                cellIndex: capture.defenderCellIndex,
                newOwner: newOwner,
                cardId: defenderCell.card.id
            });
        }

        // Визуализируем смену владельцев
        if (capturedCells.length > 0 && state.screenApi?.handleEvent) {
            addSystemMessage(`Захвачено карт: ${capturedCells.length}`);

            await state.screenApi.handleEvent({
                type: 'ownership_change',
                changes: capturedCells.map(cellIndex => ({
                    cellIndex,
                    newOwner
                }))
            });

            // Синхронизируем после визуализации
            syncFieldState();
        }

        // Возвращаем захваченные ячейки для комбо (комбо вызывается в processMoveConsequences)
        return capturedCells;
    }

    /**
     * Шаг 3.3: Обработка битв
     * Возвращает объект { capturedCells: [], attackerLost: boolean }
     */
    async function processBattles(battles, attackerCellIndex, attackerOwner) {
        if (battles.length === 0) return { capturedCells: [], attackerLost: false };

        let selectedTarget;

        if (battles.length === 1) {
            // Одна цель - сражаемся автоматически
            selectedTarget = battles[0];
        } else {
            // Несколько целей - выбор
            if (attackerOwner === 'player') {
                // Игрок выбирает цель
                addSystemMessage('Выберите цель для атаки!');
                selectedTarget = await playerSelectsTarget(battles);
            } else {
                // AI выбирает цель
                selectedTarget = aiSelectsTarget(battles, attackerCellIndex);
            }
        }

        if (!selectedTarget) return { capturedCells: [], attackerLost: false };

        // Шаг 3.4: Расчет боя - возвращает результат
        const battleResult = await executeBattle(attackerCellIndex, selectedTarget.defenderCellIndex, attackerOwner);
        return battleResult;
    }

    /**
     * Выбор цели игроком
     */
    async function playerSelectsTarget(battles) {
        return new Promise((resolve) => {
            const selectableCells = battles.map(b => b.defenderCellIndex);

            if (state.screenApi?.enableAttackSelection) {
                state.screenApi.enableAttackSelection(selectableCells, (selectedCellIndex) => {
                    const target = battles.find(b => b.defenderCellIndex === selectedCellIndex);
                    resolve(target || battles[0]);
                });
            } else {
                // Фоллбэк: выбираем первую цель
                resolve(battles[0]);
            }
        });
    }

    /**
     * Выбор цели AI
     */
    function aiSelectsTarget(battles, attackerCellIndex) {
        const attackerCell = getCellByIndex(attackerCellIndex);
        if (!attackerCell || !attackerCell.card) {
            return battles[0];
        }

        if (window.aiAttackSelector?.selectAiAttackTarget) {
            const context = {
                attacker: attackerCell.card,
                targets: battles.map(b => ({
                    ...b.defenderCard,
                    id: b.defenderCellIndex, // Используем индекс ячейки как ID для выбора
                    cellIndex: b.defenderCellIndex
                })),
                enemyOwner: 'player'
            };

            const selectedId = window.aiAttackSelector.selectAiAttackTarget(context);
            return battles.find(b => b.defenderCellIndex === selectedId) || battles[0];
        }

        // Резервный выбор: самая слабая защита
        return battles.reduce((weakest, current) => {
            const currentDefense = resolveDefenseValue(attackerCell.card, current.defenderCard);
            const weakestDefense = resolveDefenseValue(attackerCell.card, weakest.defenderCard);
            return currentDefense < weakestDefense ? current : weakest;
        }, battles[0]);
    }

    /**
     * Шаг 3.4: Расчет боя
     * Возвращает объект { capturedCells: [], attackerLost: boolean }
     */
    async function executeBattle(attackerCellIndex, defenderCellIndex, attackerOwner) {
        const attackerCell = getCellByIndex(attackerCellIndex);
        const defenderCell = getCellByIndex(defenderCellIndex);

        if (!attackerCell?.card || !defenderCell?.card) {
            return { capturedCells: [], attackerLost: false };
        }

        const attacker = attackerCell.card;
        const defender = defenderCell.card;

        // Определяем параметры
        const attackValue = getStatValue(attacker.attackLevel);
        const defenseValue = resolveDefenseValue(attacker, defender);

        // Бросок кубика
        const attackRoll = Math.floor(Math.random() * Math.max(1, attackValue));
        const defenseRoll = Math.floor(Math.random() * Math.max(1, defenseValue));

        const attackerWins = attackRoll >= defenseRoll;

        console.log(`PartyGameOrchestrator: Бой - Атака: ${attackRoll}/${attackValue}, Защита: ${defenseRoll}/${defenseValue}, Победитель: ${attackerWins ? 'атакующий' : 'защитник'}`);

        // Визуализируем бой
        if (state.screenApi?.handleEvent) {
            await state.screenApi.handleEvent({
                type: 'battle',
                attackerCellIndex,
                defenderCellIndex,
                attackLevel: attackRoll,
                attackType: attacker.attackType,
                defenseLevel: defenseRoll,
                defenseType: getDefenseType(attacker.attackType),
                winner: attackerWins ? 'attacker' : 'defender'
            });
        }

        await delay(500);

        // Применяем результат
        if (attackerWins) {
            // Защитник меняет владельца
            defender.owner = attackerOwner;
            defender.ownership = attackerOwner === 'player' ? 'player' : 'rival';

            logGameEvent('battle_win', {
                attackerCellIndex,
                defenderCellIndex,
                winner: attackerOwner,
                attackRoll,
                defenseRoll
            });

            // Визуализируем смену владельца
            if (state.screenApi?.handleEvent) {
                await state.screenApi.handleEvent({
                    type: 'ownership_change',
                    changes: [{ cellIndex: defenderCellIndex, newOwner: attackerOwner }]
                });
            }

            syncFieldState();

            // Возвращаем результат: атакующий победил, защитник захвачен
            return { capturedCells: [defenderCellIndex], attackerLost: false };

        } else {
            // Атакующий меняет владельца (переходит к врагу)
            const defenderOwner = attackerOwner === 'player' ? 'opponent' : 'player';
            attacker.owner = defenderOwner;
            attacker.ownership = defenderOwner === 'player' ? 'player' : 'rival';

            logGameEvent('battle_loss', {
                attackerCellIndex,
                defenderCellIndex,
                winner: defenderOwner,
                attackRoll,
                defenseRoll
            });

            // Визуализируем смену владельца атакующего
            if (state.screenApi?.handleEvent) {
                await state.screenApi.handleEvent({
                    type: 'ownership_change',
                    changes: [{ cellIndex: attackerCellIndex, newOwner: defenderOwner }]
                });
            }

            syncFieldState();

            // Атакующий проиграл - комбо и захваты не происходят
            return { capturedCells: [], attackerLost: true };
        }
    }

    /**
     * Получение типа защиты для отображения
     */
    function getDefenseType(attackType) {
        switch (attackType) {
            case 'P': return 'mechanical';
            case 'E':
            case 'M': return 'electrical';
            case 'X':
            case 'A': return 'mixed';
            default: return 'mechanical';
        }
    }

    /**
     * Шаг 3.5: Комбо (цепная реакция)
     */
    async function processComboChain(capturedCellIndices, newOwner, processedCells = new Set()) {
        const newCaptures = [];

        for (const cellIndex of capturedCellIndices) {
            if (processedCells.has(cellIndex)) continue;
            processedCells.add(cellIndex);

            const cell = getCellByIndex(cellIndex);
            if (!cell || !cell.card) continue;

            const card = cell.card;

            // Проверяем все направления захваченной карты
            for (const direction of directions) {
                // Проверяем, есть ли у карты стрелка в этом направлении
                if (!card[direction.activeArrow]) continue;

                const neighborCell = getNeighborCell(cell, direction);
                if (!neighborCell || !neighborCell.card) continue;

                // Если сосед - враг, захватываем его (комбо не требует встречной стрелки)
                if (isEnemyCard(neighborCell.card, newOwner)) {
                    // В комбо захват происходит только если у активной карты есть стрелка
                    neighborCell.card.owner = newOwner;
                    neighborCell.card.ownership = newOwner === 'player' ? 'player' : 'rival';

                    newCaptures.push(neighborCell.index);

                    logGameEvent('combo_capture', {
                        fromCellIndex: cellIndex,
                        toCellIndex: neighborCell.index,
                        newOwner
                    });
                }
            }
        }

        // Визуализируем новые захваты
        if (newCaptures.length > 0) {
            addSystemMessage(`Комбо! Захвачено карт: ${newCaptures.length}`);

            if (state.screenApi?.handleEvent) {
                await state.screenApi.handleEvent({
                    type: 'ownership_change',
                    changes: newCaptures.map(cellIndex => ({
                        cellIndex,
                        newOwner
                    }))
                });
            }

            syncFieldState();

            // Рекурсивно продолжаем комбо
            // В сложном режиме комбо не распространяется на карты, захваченные не в битве (удары в спину)
            if (state.gameMode !== 'hard') {
                await processComboChain(newCaptures, newOwner, processedCells);
            }
        }
    }

    // === Этап 4: Проверка окончания игры ===

    /**
     * Проверка окончания игры и переход хода
     */
    async function checkGameEnd() {
        syncFieldState();

        // Сохраняем снимок после каждого хода
        await saveActivePartySnapshot();

        // Подсчитываем карты на поле
        let cardsOnField = 0;
        let playerCards = 0;
        let opponentCards = 0;

        state.fieldState?.cells?.forEach(cell => {
            if (cell.card) {
                cardsOnField++;
                if (getCardOwner(cell.card) === 'player') {
                    playerCards++;
                } else {
                    opponentCards++;
                }
            }
        });

        // Считаем доступные ячейки
        const availableCells = state.fieldState?.cells?.filter(c => c.isAvailable && !c.card).length || 0;

        // Проверяем, остались ли карты в руках
        const playerHasCards = state.playerHand.some(c => !c.used);
        const opponentHasCards = state.opponentHand.some(c => !c.used);

        console.log(`PartyGameOrchestrator: Поле: ${cardsOnField}, Свободных: ${availableCells}, Игрок: ${playerHasCards}, Оппонент: ${opponentHasCards}`);

        if (state.currentTurn === 'player' && !playerHasCards && opponentHasCards) {
            state.currentTurn = 'rival';
            await startRivalTurn();
            return;
        }

        if (state.currentTurn === 'rival' && !opponentHasCards && playerHasCards) {
            state.currentTurn = 'player';
            await startPlayerTurn();
            return;
        }

        // Проверяем условия окончания
        const gameOver = (
            availableCells === 0 ||
            (!playerHasCards && !opponentHasCards)
        );

        if (gameOver) {
            // Этап 5: Финал партии
            await processGameEnd(playerCards, opponentCards);
            return;
        }

        // Переключаем ход
        await switchTurn();
    }

    /**
     * Переключение хода
     */
    async function switchTurn() {
        // Небольшая задержка перед сменой хода
        await delay(1000);

        if (state.currentTurn === 'player') {
            await startRivalTurn();
        } else {
            await startPlayerTurn();
        }
    }

    // === Этап 5: Финал партии ===

    /**
     * Обработка окончания игры
     */
    async function processGameEnd(playerScore, opponentScore) {
        state.isGameActive = false;

        let winner;
        let outcome;

        if (playerScore > opponentScore) {
            winner = 'player';
            outcome = 'win';
            addSystemMessage(`Победа! Счёт: ${playerScore}:${opponentScore}`);
        } else if (opponentScore > playerScore) {
            winner = 'opponent';
            outcome = 'loss';
            addSystemMessage(`Поражение! Счёт: ${playerScore}:${opponentScore}`);
        } else {
            winner = null;
            outcome = 'draw';
            addSystemMessage(`Ничья! Счёт: ${playerScore}:${opponentScore}`);
        }

        logGameEvent('game_end', { winner, playerScore, opponentScore });

        // Этап 6: Расчет прогрессии
        const leveledUpCards = await processLevelUp();

        // Показываем повышение уровней
        if (leveledUpCards.length > 0) {
            await showLevelUp(leveledUpCards);
        }

        // Отправляем результат на экран
        if (state.screenApi?.handleEvent) {
            await state.screenApi.handleEvent({
                type: 'game_end',
                winner: winner,
                outcome: outcome,
                playerScore: playerScore,
                opponentScore: opponentScore,
                leveledUpCardIds: leveledUpCards.map(c => c.id)
            });
        }

        // Обработка награды
        if (outcome === 'win') {
            await handlePlayerVictory();
        } else if (outcome === 'loss') {
            await handlePlayerDefeat();
        } else {
            await handleDraw();
        }
    }

    // === Этап 6: Логика прогрессии ===

    /**
     * Расчет повышения уровня карт
     */
    async function processLevelUp() {
        const leveledUpCards = [];

        if (!window.cardRenderer?.generateCardParams) {
            console.warn('PartyGameOrchestrator: cardRenderer недоступен, прокачка по БД пропущена');
            return leveledUpCards;
        }

        try {
            if (window.cardRenderer?.init) {
                await window.cardRenderer.init();
            }
        } catch (error) {
            console.warn('PartyGameOrchestrator: не удалось инициализировать cardRenderer для прокачки', error);
            return leveledUpCards;
        }

        // Только карты игрока, которые были использованы
        const usedPlayerCards = state.playerHand.filter(c => c.used);

        for (const card of usedPlayerCards) {
            const currentLevel = Number(card.cardLevel || 1);

            if (currentLevel >= MAX_CARD_LEVEL) {
                continue; // Уже максимальный уровень
            }

            const roll = Math.random();
            if (roll < LEVEL_UP_CHANCE) {
                const newLevel = currentLevel + 1;

                // Генерируем новые параметры по тем же правилам, что и в userCards.processCardLevelUp
                const upgradedStats = generateLevelUpStats(card.cardTypeId, newLevel);
                if (!upgradedStats) {
                    continue;
                }

                // Обновляем карту
                card.cardLevel = newLevel;
                card.attackLevel = upgradedStats.attackLevel;
                card.attackType = upgradedStats.attackType;
                card.mechanicalDefense = upgradedStats.mechanicalDefense;
                card.electricalDefense = upgradedStats.electricalDefense;
                card.arrowTopLeft = upgradedStats.arrowTopLeft;
                card.arrowTop = upgradedStats.arrowTop;
                card.arrowTopRight = upgradedStats.arrowTopRight;
                card.arrowRight = upgradedStats.arrowRight;
                card.arrowBottomRight = upgradedStats.arrowBottomRight;
                card.arrowBottom = upgradedStats.arrowBottom;
                card.arrowBottomLeft = upgradedStats.arrowBottomLeft;
                card.arrowLeft = upgradedStats.arrowLeft;

                leveledUpCards.push({
                    id: card.id,
                    cardTypeId: card.cardTypeId,
                    oldLevel: currentLevel,
                    newLevel: newLevel,
                    newStats: upgradedStats
                });

                logGameEvent('level_up', {
                    cardId: card.id,
                    oldLevel: currentLevel,
                    newLevel: newLevel
                });
            }
        }

        return leveledUpCards;
    }

    /**
     * Генерация новых статов при повышении уровня
     */
    function generateLevelUpStats(cardTypeId, newLevel) {
        try {
            return window.cardRenderer.generateCardParams(cardTypeId, newLevel);
        } catch (error) {
            console.warn('PartyGameOrchestrator: ошибка генерации параметров level up через cardRenderer', error);
            return null;
        }
    }

    /**
     * Показ анимации повышения уровня
     */
    async function showLevelUp(leveledUpCards) {
        if (leveledUpCards.length === 0) return;

        addSystemMessage(`Карты повысили уровень: ${leveledUpCards.length}!`);

        // Если экран поддерживает отображение level up
        if (state.screenApi?.showLevelUp) {
            await state.screenApi.showLevelUp(leveledUpCards);
        }

        await delay(2000);
    }

    /**
     * Обработка победы игрока
     */
    async function handlePlayerVictory() {
        addSystemMessage('Выберите карту соперника для взятия!');

        // Получаем ID карт оппонента, которые он выставил на поле
        const usedOpponentCardIds = new Set(
            state.opponentHand.filter(c => c.used).map(c => c.id)
        );

        // Находим эти карты на поле, которые игрок успел захватить
        const candidateCards = [];
        state.fieldState?.cells?.forEach(cell => {
            if (cell.card && usedOpponentCardIds.has(cell.card.id) && getCardOwner(cell.card) === 'player') {
                candidateCards.push({
                    ...cell.card,
                    cellIndex: cell.index
                });
            }
        });

        console.log('PartyGameOrchestrator: Карты для выбора награды:', candidateCards.length,
            'usedOpponentCardIds:', [...usedOpponentCardIds]);

        if (candidateCards.length === 0) {
            addSystemMessage('Нет доступных карт для взятия.');
            await saveGameProgress('player', null, null);
            return;
        }

        // Игрок выбирает карту
        const selectableCells = candidateCards.map(c => c.cellIndex).filter(i => i !== undefined);

        if (selectableCells.length > 0 && state.screenApi?.enableWinnerSelection) {
            // Оборачиваем callback в Promise, чтобы дождаться выбора игрока
            await new Promise((resolve) => {
                state.screenApi.enableWinnerSelection(selectableCells, async (selectedCellIndex) => {
                    const selectedCard = candidateCards.find(c => c.cellIndex === selectedCellIndex);
                    if (selectedCard) {
                        addSystemMessage(`Вы забрали карту: ${selectedCard.cardTypeId}`);
                        await saveGameProgress('player', selectedCard.id, null);
                    } else {
                        await saveGameProgress('player', null, null);
                    }
                    resolve();
                });
            });
        } else {
            // Фоллбэк: берем первую карту
            const selectedCard = candidateCards[0];
            addSystemMessage(`Вы получили карту: ${selectedCard?.cardTypeId || 'неизвестно'}`);
            await saveGameProgress('player', selectedCard?.id, null);
        }
    }

    /**
     * Обработка поражения игрока
     */
    async function handlePlayerDefeat() {
        // AI выбирает карту для кражи
        const usedPlayerCardIds = new Set(
            state.playerHand.filter(c => c.used).map(c => c.id)
        );

        // Находим карты игрока, захваченные соперником на поле
        const candidateCards = [];
        state.fieldState?.cells?.forEach(cell => {
            if (cell.card && usedPlayerCardIds.has(cell.card.id) && getCardOwner(cell.card) === 'opponent') {
                candidateCards.push({
                    ...cell.card,
                    cellIndex: cell.index
                });
            }
        });

        if (candidateCards.length === 0) {
            addSystemMessage('Соперник не смог забрать карту.');
            await saveGameProgress('rival', null, null);
            return;
        }

        // AI выбирает карту
        let selectedCardId;

        if (window.aiRewardSelector?.selectAiRewardCard) {
            selectedCardId = window.aiRewardSelector.selectAiRewardCard(candidateCards);
        } else {
            // Резервный выбор: случайная карта
            selectedCardId = candidateCards[Math.floor(Math.random() * candidateCards.length)]?.id;
        }

        const selectedCard = candidateCards.find(c => c.id === selectedCardId);

        addSystemMessage(`Соперник забрал вашу карту!`);

        const selectedCellIndex = findCardCellIndex(selectedCardId);
        if (selectedCellIndex !== null && state.screenApi?.highlightRewardCard) {
            state.screenApi.highlightRewardCard(selectedCellIndex);
        }

        await delay(1500);

        await saveGameProgress('rival', null, selectedCardId);
    }

    /**
     * Обработка ничьей
     */
    async function handleDraw() {
        addSystemMessage('Ничья! Карты не меняются.');
        await saveGameProgress('draw', null, null);
    }

    /**
     * Сохранение прогресса игры
     */
    async function saveGameProgress(winner, rewardCardId, lostCardId) {
        try {
            // Получаем текущие данные пользователя
            if (!window.userCards?.getUserData) {
                console.warn('PartyGameOrchestrator: userCards API недоступен');
                return;
            }

            const userData = await window.userCards.getUserData();
            if (!userData) {
                console.warn('PartyGameOrchestrator: Данные пользователя недоступны');
                return;
            }

            // 1. Обновляем историю партий
            if (!userData.parties) {
                userData.parties = [];
            }

            // Используем новую функцию recordPartyResult для консистентности
            if (window.userCards?.recordPartyResult) {
                await window.userCards.recordPartyResult(
                    state.opponentId,
                    winner === 'player',
                    state.opponentData?.sequence || 1,
                    state.gameMode
                );
            } else {
                // Фоллбэк если функция не найдена (не должно случаться)
                userData.parties.push({
                    id: Date.now(),
                    opponent_id: state.opponentId,
                    win: winner === 'player',
                    opponent_power: state.opponentData?.sequence || 1,
                    gameMode: state.gameMode,
                    date: new Date().toISOString()
                });
            }

            // 2. Применяем прокачку карт
            const leveledUpCards = state.playerHand.filter(c => c.used && c.leveledUp);

            for (const card of state.playerHand.filter(c => c.used)) {
                const userCard = userData.cards?.find(c => c.id === card.id);
                if (userCard) {
                    userCard.cardLevel = card.cardLevel;
                    userCard.attackLevel = card.attackLevel;
                    userCard.attackType = card.attackType;
                    userCard.mechanicalDefense = card.mechanicalDefense;
                    userCard.electricalDefense = card.electricalDefense;
                    userCard.arrowTopLeft = card.arrowTopLeft;
                    userCard.arrowTop = card.arrowTop;
                    userCard.arrowTopRight = card.arrowTopRight;
                    userCard.arrowRight = card.arrowRight;
                    userCard.arrowBottomRight = card.arrowBottomRight;
                    userCard.arrowBottom = card.arrowBottom;
                    userCard.arrowBottomLeft = card.arrowBottomLeft;
                    userCard.arrowLeft = card.arrowLeft;
                }
            }

            // 3. Смена владельца при победе игрока
            if (winner === 'player' && rewardCardId) {
                // Находим карту в данных матча
                const rewardCard = state.opponentHand.find(c => c.id === rewardCardId) ||
                    findCardOnField(rewardCardId);

                if (rewardCard) {
                    // Проверяем, есть ли уже такая карта
                    const existingCard = userData.cards?.find(c => c.id === rewardCardId);

                    if (existingCard) {
                        existingCard.cardholder_id = PLAYER_CARDHOLDER_ID;
                        existingCard.ownership = 'player';
                        existingCard.inHand = false;
                    } else {
                        // Добавляем новую карту
                        const newCard = {
                            ...rewardCard,
                            id: rewardCardId,
                            cardholder_id: PLAYER_CARDHOLDER_ID,
                            ownership: 'player',
                            inHand: false,
                            used: false
                        };
                        delete newCard.owner;
                        delete newCard.cellIndex;

                        userData.cards = userData.cards || [];
                        userData.cards.push(newCard);
                    }
                }
            }

            // 4. Смена владельца при поражении игрока
            if (winner === 'rival' && lostCardId) {
                const cardIndex = userData.cards?.findIndex(c => c.id === lostCardId);
                if (cardIndex !== undefined && cardIndex !== -1) {
                    // Удаляем карту у игрока
                    userData.cards.splice(cardIndex, 1);
                }
            }

            // 5. Сбрасываем флаги inHand для использованных карт
            for (const card of state.playerHand) {
                const userCard = userData.cards?.find(c => c.id === card.id);
                if (userCard) {
                    userCard.inHand = false;
                    userCard.used = false;
                }
            }

            // 6. Очищаем снимок активной партии (в том же объекте, чтобы избежать двойного сохранения)
            userData.activeParty = null;

            // 7. Сохраняем данные
            await window.userCards.saveUserData(userData);

            console.log('PartyGameOrchestrator: Прогресс игры сохранён, снимок партии очищен');

        } catch (error) {
            console.error('PartyGameOrchestrator: Ошибка сохранения прогресса:', error);
        }
    }

    /**
     * Поиск карты на поле
     */
    function findCardOnField(cardId) {
        if (!state.fieldState?.cells) return null;

        for (const cell of state.fieldState.cells) {
            if (cell.card && cell.card.id === cardId) {
                return cell.card;
            }
        }
        return null;
    }

    function findCardCellIndex(cardId) {
        if (!state.fieldState?.cells) return null;

        for (const cell of state.fieldState.cells) {
            if (cell.card && cell.card.id === cardId) {
                return cell.index;
            }
        }

        return null;
    }

    // === Вспомогательные функции коммуникации ===

    /**
     * Добавление системного сообщения
     */
    function addSystemMessage(text) {
        console.log(`PartyGameOrchestrator: ${text}`);

        if (state.screenApi?.showMessage) {
            state.screenApi.showMessage(text);
        }
    }

    /**
     * Логирование игрового события
     */
    function logGameEvent(type, data) {
        const event = {
            type,
            timestamp: Date.now(),
            turnNumber: state.turnNumber,
            currentTurn: state.currentTurn,
            ...data
        };

        state.gameHistory.push(event);
        console.log('PartyGameOrchestrator: Event logged:', event);
    }

    /**
     * Обновление состояния поля от экрана
     */
    function onFieldStateUpdate(fieldState) {
        if (fieldState) {
            state.fieldState = fieldState;
        }
    }

    // === Сохранение/восстановление активной партии ===

    /**
     * Сохраняет снимок активной партии в персистентное хранилище.
     * Вызывается при старте игры и после каждого хода.
     */
    async function saveActivePartySnapshot() {
        try {
            if (!window.userCards?.getUserData || !window.userCards?.saveUserData) {
                console.warn('PartyGameOrchestrator: userCards API недоступен для сохранения снимка');
                return;
            }

            // Синхронизируем состояние поля с экраном
            syncFieldState();

            // Собираем fieldCards из экрана (Map → Object)
            let fieldCardsObj = {};
            if (state.screenApi?.getState) {
                const screenState = state.screenApi.getState();
                fieldCardsObj = screenState.fieldCards || {};
            }

            const snapshot = {
                version: 1,
                startedAt: new Date().toISOString(),
                opponentId: state.opponentId,
                gameMode: state.gameMode,
                playerHand: state.playerHand,
                opponentHand: state.opponentHand,
                unavailableCells: state.unavailableCells,
                fieldCards: fieldCardsObj,
                currentTurn: state.currentTurn,
                turnNumber: state.turnNumber,
                isGameActive: state.isGameActive
            };

            const userData = await window.userCards.getUserData();
            if (userData) {
                userData.activeParty = snapshot;
                await window.userCards.saveUserData(userData);
                console.log('PartyGameOrchestrator: Снимок активной партии сохранён');
            }
        } catch (error) {
            console.error('PartyGameOrchestrator: Ошибка сохранения снимка партии:', error);
        }
    }

    /**
     * Очищает снимок активной партии из персистентного хранилища.
     */
    async function clearActivePartySnapshot() {
        try {
            if (!window.userCards?.getUserData || !window.userCards?.saveUserData) {
                return;
            }

            const userData = await window.userCards.getUserData();
            if (userData) {
                userData.activeParty = null;
                await window.userCards.saveUserData(userData);
                console.log('PartyGameOrchestrator: Снимок активной партии очищен');
            }
        } catch (error) {
            console.error('PartyGameOrchestrator: Ошибка очистки снимка партии:', error);
        }
    }

    /**
     * Возобновление игры из сохранённого снимка.
     * Восстанавливает состояние оркестратора без инициализации нового поля и монетки.
     */
    async function resume(snapshot) {
        console.log('PartyGameOrchestrator: Возобновление игры из снимка');

        // Сохраняем ссылку на API экрана
        state.screenApi = window.partyScreen;

        // Восстанавливаем состояние из снимка
        state.opponentId = snapshot.opponentId;
        state.gameMode = snapshot.gameMode;
        state.playerHand = snapshot.playerHand;
        state.opponentHand = snapshot.opponentHand;
        state.unavailableCells = snapshot.unavailableCells;
        state.currentTurn = snapshot.currentTurn;
        state.turnNumber = snapshot.turnNumber;
        state.isGameActive = true;
        state.isProcessingMove = false;
        state.gameHistory = [];
        state.currentMoveBattles = [];
        state.pendingCaptures = [];

        // Получаем данные оппонента
        if (state.opponentId && window.partyScreen) {
            state.opponentData = await getOpponentData(state.opponentId);
        }

        // Синхронизируем состояние поля с экраном (карты уже размещены)
        syncFieldState();

        // Логируем событие возобновления
        logGameEvent('game_resume', {
            currentTurn: state.currentTurn,
            turnNumber: state.turnNumber
        });

        addSystemMessage('Партия восстановлена!');
        await delay(1000);

        // Продолжаем с нужного хода
        if (state.currentTurn === 'player') {
            await startPlayerTurn();
        } else {
            await startRivalTurn();
        }
    }

    /**
     * Получение текущего состояния оркестратора
     */
    function getState() {
        return {
            currentTurn: state.currentTurn,
            turnNumber: state.turnNumber,
            isGameActive: state.isGameActive,
            playerHand: state.playerHand,
            opponentHand: state.opponentHand,
            fieldState: state.fieldState,
            gameHistory: state.gameHistory
        };
    }

    // === Публичный API ===
    return {
        start,
        resume,
        onPlayerMove,
        onFieldStateUpdate,
        getState,
        addSystemMessage,
        clearActivePartySnapshot
    };
})();

// Экспорт в глобальную область
window.partyGameOrchestrator = partyGameOrchestrator;

console.log('PartyGameOrchestrator: Модуль загружен. Ожидание запуска от экрана партии.');
