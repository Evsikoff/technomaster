/**
 * Opponent Prep Orchestrator Module for Technomaster
 * Оркестратор подготовки к партии
 *
 * Запускается при клике на бейдж оппонента в контейнере "opponents-section"
 */

const ORCHESTRATOR_DB_PATH = 'public/data/cards.db';
const PLAYER_CARDHOLDER_ID = 1;
const REQUIRED_HAND_SIZE = 5;

/**
 * Состояние оркестратора
 */
const orchestratorState = {
    db: null,
    opponentId: null,
    userData: null,
    playerCards: [],
    opponentCards: [],
    playerHandCards: [],
    opponentHandCards: [],
    opponentCardholderId: null
};

/**
 * Инициализирует SQLite базу данных
 * @returns {Promise<Database>}
 */
async function initOrchestratorDatabase() {
    if (orchestratorState.db) {
        return orchestratorState.db;
    }

    const SQL = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });

    const response = await fetch(ORCHESTRATOR_DB_PATH);
    const buffer = await response.arrayBuffer();
    orchestratorState.db = new SQL.Database(new Uint8Array(buffer));

    return orchestratorState.db;
}

/**
 * Получает правила генерации колоды для оппонента из БД
 * @param {number} opponentId - Идентификатор оппонента
 * @returns {Promise<Object|null>}
 */
async function getDeckRulesForOpponent(opponentId) {
    const db = await initOrchestratorDatabase();

    // Находим все записи с данным opponent_id и берем с максимальным id
    const result = db.exec(
        `SELECT id, opponent_id, deck_size, level_min, level_max,
                group_1_weight, group_2_weight, group_3_weight, group_4_weight
         FROM deck_rules
         WHERE opponent_id = ${opponentId}
         ORDER BY id DESC
         LIMIT 1`
    );

    if (!result.length || !result[0].values.length) {
        console.error(`Orchestrator: Правила колоды для оппонента ${opponentId} не найдены`);
        return null;
    }

    const row = result[0].values[0];
    return {
        id: row[0],
        opponent_id: row[1],
        deck_size: row[2],
        level_min: row[3],
        level_max: row[4],
        group_1_weight: row[5],
        group_2_weight: row[6],
        group_3_weight: row[7],
        group_4_weight: row[8]
    };
}

/**
 * Получает данные пользователя из соответствующего хранилища
 * @returns {Promise<Object|null>}
 */
async function fetchUserData() {
    await window.userCards.whenReady();
    const userData = await window.userCards.getUserData();
    return userData;
}

/**
 * Сохраняет данные пользователя в хранилище
 * @param {Object} userData - Данные для сохранения
 * @returns {Promise<boolean>}
 */
async function persistUserData(userData) {
    return await window.userCards.saveUserData(userData);
}

/**
 * Находит количество карт игрока (cardholder_id = 1)
 * @param {Object} userData - Пользовательские данные
 * @returns {number}
 */
function countPlayerCards(userData) {
    if (!userData || !Array.isArray(userData.cards)) {
        return 0;
    }
    return userData.cards.filter(card => card.cardholder_id === PLAYER_CARDHOLDER_ID).length;
}

/**
 * Получает карты игрока
 * @param {Object} userData - Пользовательские данные
 * @returns {Array}
 */
function getPlayerCards(userData) {
    if (!userData || !Array.isArray(userData.cards)) {
        return [];
    }
    return userData.cards.filter(card => card.cardholder_id === PLAYER_CARDHOLDER_ID);
}

/**
 * Находит cardholder оппонента по opponent_id
 * @param {Object} userData - Пользовательские данные
 * @param {number} opponentId - Идентификатор оппонента
 * @returns {Object|null}
 */
function findOpponentCardholder(userData, opponentId) {
    if (!userData || !Array.isArray(userData.cardholders)) {
        return null;
    }
    return userData.cardholders.find(ch => ch.opponent_id === String(opponentId));
}

/**
 * Создает нового cardholder для оппонента
 * @param {Object} userData - Пользовательские данные
 * @param {number} opponentId - Идентификатор оппонента
 * @returns {Object} - Созданный cardholder
 */
function createOpponentCardholder(userData, opponentId) {
    const newId = userData.cardholders.length + 1;
    const newCardholder = {
        id: newId,
        player: false,
        opponent_id: String(opponentId)
    };
    userData.cardholders.push(newCardholder);
    console.log(`Orchestrator: Создан новый cardholder для оппонента ${opponentId} с id=${newId}`);
    return newCardholder;
}

/**
 * Получает карты оппонента по cardholder_id
 * @param {Object} userData - Пользовательские данные
 * @param {number} cardholderId - Идентификатор cardholder
 * @returns {Array}
 */
function getOpponentCards(userData, cardholderId) {
    if (!userData || !Array.isArray(userData.cards)) {
        return [];
    }
    return userData.cards.filter(card => card.cardholder_id === cardholderId);
}

/**
 * Сохраняет сгенерированные карты оппонента в хранилище
 * @param {Object} userData - Пользовательские данные
 * @param {Array} generatedCards - Сгенерированные карты
 * @param {number} cardholderId - Идентификатор cardholder оппонента
 * @returns {Array} - Сохраненные карты с ID
 */
function saveOpponentCards(userData, generatedCards, cardholderId) {
    // Генерируем уникальные ID для карт
    let maxCardId = userData.cards.reduce((max, card) => Math.max(max, card.id || 0), 0);

    const savedCards = generatedCards.map(genCard => {
        maxCardId++;
        const params = genCard.renderParams;
        const newCard = {
            id: maxCardId,
            cardholder_id: cardholderId,
            cardTypeId: params.cardTypeId,
            arrowTopLeft: params.arrowTopLeft,
            arrowTop: params.arrowTop,
            arrowTopRight: params.arrowTopRight,
            arrowRight: params.arrowRight,
            arrowBottomRight: params.arrowBottomRight,
            arrowBottom: params.arrowBottom,
            arrowBottomLeft: params.arrowBottomLeft,
            arrowLeft: params.arrowLeft,
            ownership: 'rival',
            cardLevel: parseInt(params.cardLevel, 10) || 1,
            attackLevel: parseInt(params.attackLevel, 10) || 0,
            attackType: params.attackType || 'P',
            mechanicalDefense: parseInt(params.mechanicalDefense, 10) || 0,
            electricalDefense: parseInt(params.electricalDefense, 10) || 0,
            inHand: false
        };
        userData.cards.push(newCard);
        return newCard;
    });

    console.log(`Orchestrator: Сохранено ${savedCards.length} карт для оппонента (cardholder_id=${cardholderId})`);
    return savedCards;
}

/**
 * Устанавливает все карты оппонента в руку (inHand = true)
 * @param {Object} userData - Пользовательские данные
 * @param {number} cardholderId - Идентификатор cardholder оппонента
 */
function putAllOpponentCardsInHand(userData, cardholderId) {
    const opponentCards = getOpponentCards(userData, cardholderId);
    opponentCards.forEach(card => {
        card.inHand = true;
    });
    console.log(`Orchestrator: Все ${opponentCards.length} карт оппонента положены в руку`);
}

/**
 * Сбрасывает все карты оппонента из руки (inHand = false)
 * @param {Object} userData - Пользовательские данные
 * @param {number} cardholderId - Идентификатор cardholder оппонента
 */
function removeAllOpponentCardsFromHand(userData, cardholderId) {
    const opponentCards = getOpponentCards(userData, cardholderId);
    opponentCards.forEach(card => {
        card.inHand = false;
    });
    console.log(`Orchestrator: Все ${opponentCards.length} карт оппонента убраны из руки`);
}

/**
 * Устанавливает карты в руку по массиву ID
 * @param {Object} userData - Пользовательские данные
 * @param {Array} cardIds - Массив ID карт для руки
 */
function putCardsInHandByIds(userData, cardIds) {
    const idsSet = new Set(cardIds.map(item => item.id));
    userData.cards.forEach(card => {
        if (idsSet.has(card.id)) {
            card.inHand = true;
        }
    });
    console.log(`Orchestrator: ${cardIds.length} карт положены в руку`);
}

/**
 * Устанавливает все карты игрока в руку (inHand = true)
 * @param {Object} userData - Пользовательские данные
 */
function putAllPlayerCardsInHand(userData) {
    const playerCards = getPlayerCards(userData);
    playerCards.forEach(card => {
        card.inHand = true;
    });
    console.log(`Orchestrator: Все ${playerCards.length} карт игрока положены в руку`);
}

/**
 * Подготовка руки игрока
 * @param {Object} userData - Пользовательские данные
 * @param {number} opponentId - Идентификатор оппонента
 * @returns {Promise<Object>} - Результат подготовки { success, needsManualSetup, error, playerHand }
 */
async function preparePlayerHand(userData, opponentId) {
    const playerCardCount = countPlayerCards(userData);

    console.log(`Orchestrator: Количество карт игрока: ${playerCardCount}`);

    if (playerCardCount < REQUIRED_HAND_SIZE) {
        return {
            success: false,
            needsManualSetup: false,
            error: 'Недостаточно карт для игры. Перейдите в раздел "Моя колода", чтобы получить новые карты.',
            playerHand: []
        };
    }

    if (playerCardCount === REQUIRED_HAND_SIZE) {
        // Автоматически положить все карты в руку
        putAllPlayerCardsInHand(userData);
        const playerHand = getPlayerCards(userData).filter(c => c.inHand);
        return {
            success: true,
            needsManualSetup: false,
            error: null,
            playerHand
        };
    }

    // Карт больше 5 - требуется ручная настройка руки
    return {
        success: true,
        needsManualSetup: true,
        error: null,
        playerHand: []
    };
}

/**
 * Подготовка руки оппонента
 * @param {Object} userData - Пользовательские данные
 * @param {number} opponentId - Идентификатор оппонента
 * @returns {Promise<Object>} - Результат подготовки { success, error, opponentHand, cardholderId }
 */
async function prepareOpponentHand(userData, opponentId) {
    // Шаг 1: Ищем cardholder оппонента
    let opponentCardholder = findOpponentCardholder(userData, opponentId);

    if (!opponentCardholder) {
        // Создаем нового cardholder для оппонента
        opponentCardholder = createOpponentCardholder(userData, opponentId);

        // Получаем правила генерации колоды
        const deckRules = await getDeckRulesForOpponent(opponentId);
        if (!deckRules) {
            return {
                success: false,
                error: `Не найдены правила генерации колоды для оппонента ${opponentId}`,
                opponentHand: [],
                cardholderId: opponentCardholder.id
            };
        }

        // Инициализируем cardRenderer
        await window.cardRenderer.init();

        // Генерируем колоду карт для оппонента
        console.log(`Orchestrator: Генерация колоды для оппонента с параметрами:`, deckRules);
        const generatedDeck = window.cardRenderer.generateDeck({
            deck_size: deckRules.deck_size,
            level_min: deckRules.level_min,
            level_max: deckRules.level_max,
            group_1_weight: deckRules.group_1_weight,
            group_2_weight: deckRules.group_2_weight,
            group_3_weight: deckRules.group_3_weight,
            group_4_weight: deckRules.group_4_weight
        });

        // Сохраняем карты оппонента
        saveOpponentCards(userData, generatedDeck, opponentCardholder.id);

        // Кладем все карты оппонента в руку
        putAllOpponentCardsInHand(userData, opponentCardholder.id);

        const opponentHand = getOpponentCards(userData, opponentCardholder.id).filter(c => c.inHand);
        return {
            success: true,
            error: null,
            opponentHand,
            cardholderId: opponentCardholder.id
        };
    }

    // Cardholder найден - проверяем количество карт оппонента
    const opponentCards = getOpponentCards(userData, opponentCardholder.id);
    const opponentCardCount = opponentCards.length;

    console.log(`Orchestrator: Cardholder оппонента найден (id=${opponentCardholder.id}), карт: ${opponentCardCount}`);

    if (opponentCardCount === REQUIRED_HAND_SIZE) {
        // Ровно 5 карт - автоматически кладем в руку
        putAllOpponentCardsInHand(userData, opponentCardholder.id);
        const opponentHand = getOpponentCards(userData, opponentCardholder.id).filter(c => c.inHand);
        return {
            success: true,
            error: null,
            opponentHand,
            cardholderId: opponentCardholder.id
        };
    }

    if (opponentCardCount < REQUIRED_HAND_SIZE) {
        // Недостаточно карт - нужно догенерировать
        const cardsNeeded = REQUIRED_HAND_SIZE - opponentCardCount;
        console.log(`Orchestrator: Нужно догенерировать ${cardsNeeded} карт для оппонента`);

        // Получаем правила генерации колоды
        const deckRules = await getDeckRulesForOpponent(opponentId);
        if (!deckRules) {
            return {
                success: false,
                error: `Не найдены правила генерации колоды для оппонента ${opponentId}`,
                opponentHand: [],
                cardholderId: opponentCardholder.id
            };
        }

        // Инициализируем cardRenderer
        await window.cardRenderer.init();

        // Генерируем недостающие карты
        const generatedDeck = window.cardRenderer.generateDeck({
            deck_size: cardsNeeded,
            level_min: deckRules.level_min,
            level_max: deckRules.level_max,
            group_1_weight: deckRules.group_1_weight,
            group_2_weight: deckRules.group_2_weight,
            group_3_weight: deckRules.group_3_weight,
            group_4_weight: deckRules.group_4_weight
        });

        // Сохраняем новые карты оппонента
        saveOpponentCards(userData, generatedDeck, opponentCardholder.id);

        // Кладем все карты оппонента в руку
        putAllOpponentCardsInHand(userData, opponentCardholder.id);

        const opponentHand = getOpponentCards(userData, opponentCardholder.id).filter(c => c.inHand);
        return {
            success: true,
            error: null,
            opponentHand,
            cardholderId: opponentCardholder.id
        };
    }

    // Карт больше 5 - используем autoHandCollector
    console.log(`Orchestrator: У оппонента ${opponentCardCount} карт (>5), используем autoHandCollector`);

    // Сбрасываем все карты из руки
    removeAllOpponentCardsFromHand(userData, opponentCardholder.id);

    // Получаем все карты оппонента
    const allOpponentCards = getOpponentCards(userData, opponentCardholder.id);

    // Запускаем автоматический сбор руки
    const handResult = window.autoHandCollector.collectHand(allOpponentCards);
    console.log(`Orchestrator: autoHandCollector вернул ${handResult.length} карт:`, handResult);

    // Кладем выбранные карты в руку
    putCardsInHandByIds(userData, handResult);

    const opponentHand = getOpponentCards(userData, opponentCardholder.id).filter(c => c.inHand);
    return {
        success: true,
        error: null,
        opponentHand,
        cardholderId: opponentCardholder.id
    };
}

/**
 * Главная функция оркестратора подготовки к партии
 * @param {number} opponentId - Идентификатор оппонента
 * @returns {Promise<Object>} - Результат подготовки
 */
async function startOpponentPrep(opponentId) {
    console.log('=== Orchestrator: Начало подготовки к партии ===');
    console.log(`Orchestrator: Идентификатор оппонента: ${opponentId}`);

    orchestratorState.opponentId = opponentId;

    try {
        // Шаг 1: Получаем пользовательские данные из хранилища
        const userData = await fetchUserData();
        if (!userData) {
            throw new Error('Не удалось получить данные пользователя');
        }
        orchestratorState.userData = userData;

        // Шаг 2: Подготовка руки игрока
        console.log('--- Orchestrator: Подготовка руки игрока ---');
        const playerResult = await preparePlayerHand(userData, opponentId);

        if (!playerResult.success) {
            // Показываем ошибку пользователю
            alert(playerResult.error);
            return {
                success: false,
                error: playerResult.error,
                phase: 'player_hand'
            };
        }

        if (playerResult.needsManualSetup) {
            // Требуется ручная настройка - сохраняем данные и перенаправляем
            await persistUserData(userData);
            console.log('Orchestrator: Требуется ручная настройка руки, переход на экран hand-setup');
            window.location.href = `hand-setup.html?opponentId=${opponentId}`;
            return {
                success: true,
                redirected: true,
                phase: 'player_hand_setup'
            };
        }

        orchestratorState.playerHandCards = playerResult.playerHand;

        // Шаг 3: Подготовка руки оппонента
        console.log('--- Orchestrator: Подготовка руки оппонента ---');
        const opponentResult = await prepareOpponentHand(userData, opponentId);

        if (!opponentResult.success) {
            alert(opponentResult.error);
            return {
                success: false,
                error: opponentResult.error,
                phase: 'opponent_hand'
            };
        }

        orchestratorState.opponentHandCards = opponentResult.opponentHand;
        orchestratorState.opponentCardholderId = opponentResult.cardholderId;

        // Шаг 4: Сохраняем все изменения в хранилище
        await persistUserData(userData);

        // Шаг 5: Запускаем экран партии
        console.log('=== Orchestrator: Подготовка завершена ===');
        console.log(`Orchestrator: Карты игрока в руке: ${orchestratorState.playerHandCards.map(c => c.id).join(', ')}`);
        console.log(`Orchestrator: Карты оппонента в руке: ${orchestratorState.opponentHandCards.map(c => c.id).join(', ')}`);

        // Переход на экран партии
        const playerHandIds = orchestratorState.playerHandCards.map(c => c.id).join(',');
        const opponentHandIds = orchestratorState.opponentHandCards.map(c => c.id).join(',');

        // TODO: Заменить на реальный экран партии когда он будет готов
        // window.location.href = `game.html?opponentId=${opponentId}&playerHand=${playerHandIds}&opponentHand=${opponentHandIds}`;

        // Пока показываем уведомление и данные
        console.log('Orchestrator: Данные для экрана партии:', {
            opponentId,
            playerHand: orchestratorState.playerHandCards,
            opponentHand: orchestratorState.opponentHandCards
        });

        // Запускаем экран партии (если он существует)
        if (typeof window.startGameScreen === 'function') {
            window.startGameScreen({
                opponentId,
                playerHand: orchestratorState.playerHandCards,
                opponentHand: orchestratorState.opponentHandCards
            });
        } else {
            // Временное решение - переходим на hand-setup для отображения
            window.location.href = `hand-setup.html?opponentId=${opponentId}`;
        }

        return {
            success: true,
            phase: 'complete',
            data: {
                opponentId,
                playerHand: orchestratorState.playerHandCards,
                opponentHand: orchestratorState.opponentHandCards
            }
        };

    } catch (error) {
        console.error('Orchestrator: Ошибка при подготовке к партии:', error);
        alert(`Ошибка при подготовке к партии: ${error.message}`);
        return {
            success: false,
            error: error.message,
            phase: 'unknown'
        };
    }
}

/**
 * Получает текущее состояние оркестратора
 * @returns {Object}
 */
function getOrchestratorState() {
    return { ...orchestratorState };
}

/**
 * Сбрасывает состояние оркестратора
 */
function resetOrchestratorState() {
    orchestratorState.opponentId = null;
    orchestratorState.userData = null;
    orchestratorState.playerCards = [];
    orchestratorState.opponentCards = [];
    orchestratorState.playerHandCards = [];
    orchestratorState.opponentHandCards = [];
    orchestratorState.opponentCardholderId = null;
    console.log('Orchestrator: Состояние сброшено');
}

// Экспортируем функции в глобальную область
window.opponentPrepOrchestrator = {
    start: startOpponentPrep,
    getState: getOrchestratorState,
    reset: resetOrchestratorState
};

console.log('OpponentPrepOrchestrator: Модуль загружен. Используйте opponentPrepOrchestrator.start(opponentId) для запуска.');
