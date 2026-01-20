const PARTY_PENDING_KEY = 'technomaster.party.pending';
const PARTY_PAYLOAD_KEY = 'technomaster.party.payload';
const DECK_RULES_DB_PATH = 'public/data/cards.db';
const PLAYER_CARDHOLDER_ID = 1;
const HAND_SIZE = 5;

let deckRulesDb = null;

async function getDeckRulesDb() {
    if (deckRulesDb) {
        return deckRulesDb;
    }

    const SQL = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });

    const response = await fetch(DECK_RULES_DB_PATH);
    const buffer = await response.arrayBuffer();
    deckRulesDb = new SQL.Database(new Uint8Array(buffer));

    return deckRulesDb;
}

async function getLatestDeckRule(opponentId) {
    const db = await getDeckRulesDb();
    const opponentValue = Number(opponentId);

    if (!Number.isFinite(opponentValue)) {
        throw new Error('Некорректный идентификатор оппонента для правил колоды.');
    }

    const result = db.exec(
        `SELECT id, deck_size, level_min, level_max, group_1_weight, group_2_weight, group_3_weight, group_4_weight
         FROM deck_rules
         WHERE opponent_id = ${opponentValue}
         ORDER BY id DESC
         LIMIT 1`
    );

    if (!result.length || !result[0].values.length) {
        throw new Error('Правила генерации колоды для оппонента не найдены.');
    }

    const row = result[0].values[0];
    return {
        id: row[0],
        deck_size: row[1],
        level_min: row[2],
        level_max: row[3],
        group_1_weight: row[4],
        group_2_weight: row[5],
        group_3_weight: row[6],
        group_4_weight: row[7]
    };
}

function getStorageType() {
    if (window.userCards?.getStorageType) {
        return window.userCards.getStorageType();
    }

    if (window.userDataStorage === 'localStorage') {
        return 'localStorage';
    }

    return 'yandexCloud';
}

async function ensureUserData() {
    if (window.userCards?.whenReady) {
        await window.userCards.whenReady();
    }

    let userData = await window.userCards?.getUserData?.();

    if (!userData || !Array.isArray(userData.cardholders) || !Array.isArray(userData.cards)) {
        if (window.userCards?.createInitialUserDataStructure) {
            userData = window.userCards.createInitialUserDataStructure();
            await window.userCards.saveUserData(userData);
        } else {
            userData = {
                cardholders: [],
                cards: [],
                parties: []
            };
        }
    }

    return userData;
}

function getMaxId(items) {
    return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
}

function normalizeOpponentId(opponentId) {
    return String(opponentId);
}

function buildCardFromRenderParams(renderParams, cardholderId, cardId, ownership) {
    return {
        id: cardId,
        cardholder_id: cardholderId,
        cardTypeId: renderParams.cardTypeId,
        arrowTopLeft: renderParams.arrowTopLeft,
        arrowTop: renderParams.arrowTop,
        arrowTopRight: renderParams.arrowTopRight,
        arrowRight: renderParams.arrowRight,
        arrowBottomRight: renderParams.arrowBottomRight,
        arrowBottom: renderParams.arrowBottom,
        arrowBottomLeft: renderParams.arrowBottomLeft,
        arrowLeft: renderParams.arrowLeft,
        ownership,
        cardLevel: renderParams.cardLevel,
        attackLevel: renderParams.attackLevel,
        attackType: renderParams.attackType,
        mechanicalDefense: renderParams.mechanicalDefense,
        electricalDefense: renderParams.electricalDefense,
        inHand: false
    };
}

function getCardsByCardholder(userData, cardholderId) {
    return userData.cards.filter(card => card.cardholder_id === cardholderId);
}

function setCardsInHand(userData, cardholderId, cardIds, inHandValue) {
    const idSet = cardIds ? new Set(cardIds) : null;

    userData.cards.forEach(card => {
        if (card.cardholder_id !== cardholderId) {
            return;
        }

        if (!idSet || idSet.has(card.id)) {
            card.inHand = inHandValue;
        }
    });
}

async function appendGeneratedCards(userData, cardholderId, generatedDeck, ownership) {
    let maxCardId = getMaxId(userData.cards);

    generatedDeck.forEach(card => {
        maxCardId += 1;
        const renderParams = card.renderParams || {};
        userData.cards.push(buildCardFromRenderParams(renderParams, cardholderId, maxCardId, ownership));
    });
}

async function ensureOpponentDeck(userData, opponentId, cardholder) {
    const deckRule = await getLatestDeckRule(opponentId);

    await window.cardRenderer.init();
    const generatedDeck = window.cardRenderer.generateDeck({
        deck_size: deckRule.deck_size,
        level_min: deckRule.level_min,
        level_max: deckRule.level_max,
        group_1_weight: deckRule.group_1_weight,
        group_2_weight: deckRule.group_2_weight,
        group_3_weight: deckRule.group_3_weight,
        group_4_weight: deckRule.group_4_weight
    });

    await appendGeneratedCards(userData, cardholder.id, generatedDeck, 'rival');
}

async function addOpponentCardsToReachHand(userData, opponentId, cardholder, neededCards) {
    const deckRule = await getLatestDeckRule(opponentId);

    await window.cardRenderer.init();
    const generatedDeck = window.cardRenderer.generateDeck({
        deck_size: neededCards,
        level_min: deckRule.level_min,
        level_max: deckRule.level_max,
        group_1_weight: deckRule.group_1_weight,
        group_2_weight: deckRule.group_2_weight,
        group_3_weight: deckRule.group_3_weight,
        group_4_weight: deckRule.group_4_weight
    });

    await appendGeneratedCards(userData, cardholder.id, generatedDeck, 'rival');
}

async function prepareOpponentHand(userData, opponentId) {
    const normalizedOpponentId = normalizeOpponentId(opponentId);
    const opponentCardholders = userData.cardholders.filter(
        cardholder => String(cardholder.opponent_id) === normalizedOpponentId
    );

    let opponentCardholder = opponentCardholders[0] || null;
    const hasExistingCardholder = Boolean(opponentCardholder);

    if (!opponentCardholder) {
        opponentCardholder = {
            id: userData.cardholders.length + 1,
            player: false,
            opponent_id: normalizedOpponentId
        };
        userData.cardholders.push(opponentCardholder);
    }

    let opponentCards = getCardsByCardholder(userData, opponentCardholder.id);

    if (!hasExistingCardholder) {
        await ensureOpponentDeck(userData, opponentId, opponentCardholder);
        opponentCards = getCardsByCardholder(userData, opponentCardholder.id);
    }

    if (opponentCards.length === HAND_SIZE) {
        setCardsInHand(userData, opponentCardholder.id, null, true);
        return opponentCardholder;
    }

    if (opponentCards.length < HAND_SIZE) {
        const neededCards = HAND_SIZE - opponentCards.length;
        await addOpponentCardsToReachHand(userData, opponentId, opponentCardholder, neededCards);
        setCardsInHand(userData, opponentCardholder.id, null, true);
        return opponentCardholder;
    }

    setCardsInHand(userData, opponentCardholder.id, null, false);

    const allOpponentCards = getCardsByCardholder(userData, opponentCardholder.id);
    const selected = window.autoHandCollector.collectHand(allOpponentCards);
    const selectedIds = selected.map(card => card.id);
    setCardsInHand(userData, opponentCardholder.id, selectedIds, true);

    return opponentCardholder;
}

async function preparePlayerHand(userData) {
    const playerCards = getCardsByCardholder(userData, PLAYER_CARDHOLDER_ID);

    if (playerCards.length < HAND_SIZE) {
        throw new Error(
            'Недостаточно карт для игры. Перейдите в раздел “Моя колода”, чтобы получить новые карты.'
        );
    }

    if (playerCards.length === HAND_SIZE) {
        setCardsInHand(userData, PLAYER_CARDHOLDER_ID, null, true);
    }

    return playerCards;
}

function storePendingOpponent(opponentId) {
    sessionStorage.setItem(PARTY_PENDING_KEY, JSON.stringify({ opponentId }));
}

function readPendingOpponent() {
    const pending = sessionStorage.getItem(PARTY_PENDING_KEY);
    if (!pending) {
        return null;
    }

    try {
        return JSON.parse(pending);
    } catch (error) {
        return null;
    }
}

function clearPendingOpponent() {
    sessionStorage.removeItem(PARTY_PENDING_KEY);
}

function launchPartyScreen(opponentId, playerHand, opponentHand) {
    const payload = {
        opponentId,
        playerHand,
        opponentHand
    };

    sessionStorage.setItem(PARTY_PAYLOAD_KEY, JSON.stringify(payload));
    window.location.href = 'party.html';
}

async function startParty(opponentId) {
    const storageType = getStorageType();
    console.log(`PartyOrchestrator: Используем хранилище ${storageType}.`);

    const userData = await ensureUserData();
    const playerCards = await preparePlayerHand(userData);

    if (playerCards.length > HAND_SIZE) {
        storePendingOpponent(opponentId);
        window.location.href = `hand-setup.html?opponentId=${encodeURIComponent(opponentId)}&party=1`;
        return;
    }

    await window.userCards.saveUserData(userData);
    await finishParty(opponentId);
}

async function finishParty(opponentId) {
    const pendingOpponent = readPendingOpponent();
    const resolvedOpponentId = opponentId || pendingOpponent?.opponentId;

    if (!resolvedOpponentId) {
        throw new Error('Не удалось определить оппонента для партии.');
    }

    const userData = await ensureUserData();

    const playerHand = getCardsByCardholder(userData, PLAYER_CARDHOLDER_ID).filter(card => card.inHand);
    if (playerHand.length < HAND_SIZE) {
        throw new Error('Рука игрока не готова. Заполните руку перед стартом партии.');
    }

    const opponentCardholder = await prepareOpponentHand(userData, resolvedOpponentId);

    await window.userCards.saveUserData(userData);
    clearPendingOpponent();

    const opponentHand = getCardsByCardholder(userData, opponentCardholder.id).filter(card => card.inHand);

    launchPartyScreen(resolvedOpponentId, playerHand, opponentHand);
}

function hasPendingParty() {
    return Boolean(readPendingOpponent());
}

window.partyOrchestrator = {
    start: startParty,
    finish: finishParty,
    hasPendingParty,
    keys: {
        pending: PARTY_PENDING_KEY,
        payload: PARTY_PAYLOAD_KEY
    }
};
