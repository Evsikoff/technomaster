/**
 * Hand Setup Screen Module for Technomaster
 * Экран настройки игровой руки
 */

const HAND_SETUP_DB_PATH = 'public/data/cards.db';
const HAND_SIZE = 5;

/**
 * Глобальное состояние экрана
 */
const handSetupState = {
    opponentId: null,
    opponentData: null,
    deckRuleData: null,
    playerCards: [],
    deckCards: [],
    handCards: [],
    db: null,
    draggedCard: null,
    draggedFromHand: false
};

/**
 * Получает идентификатор оппонента из URL параметров
 * @returns {number|null}
 */
function getOpponentIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const opponentId = urlParams.get('opponentId');
    return opponentId ? parseInt(opponentId, 10) : null;
}

/**
 * Проверяет, запущен ли экран для подготовки партии.
 * @returns {boolean}
 */
function isPartyFlow() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('party') === '1';
}

/**
 * Инициализирует SQLite базу данных
 * @returns {Promise<Database>}
 */
async function initDatabase() {
    if (handSetupState.db) {
        return handSetupState.db;
    }

    const SQL = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });

    const response = await fetch(HAND_SETUP_DB_PATH);
    const buffer = await response.arrayBuffer();
    handSetupState.db = new SQL.Database(new Uint8Array(buffer));

    return handSetupState.db;
}

/**
 * Получает данные об оппоненте из базы данных
 * @param {number} opponentId
 * @returns {Promise<Object|null>}
 */
async function getOpponentData(opponentId) {
    const db = await initDatabase();

    const result = db.exec(`SELECT id, name, sequence FROM opponents WHERE id = ${opponentId}`);

    if (!result.length || !result[0].values.length) {
        return null;
    }

    const row = result[0].values[0];
    return {
        id: row[0],
        name: row[1],
        sequence: row[2]
    };
}

/**
 * Получает данные о правилах колоды для оппонента
 * @param {number} opponentId
 * @returns {Promise<Object|null>}
 */
async function getDeckRuleData(opponentId) {
    const db = await initDatabase();

    // Находим все записи с данным opponent_id и берем с максимальным id
    const result = db.exec(
        `SELECT id, opponent_id, description FROM deck_rules
         WHERE opponent_id = ${opponentId}
         ORDER BY id DESC
         LIMIT 1`
    );

    if (!result.length || !result[0].values.length) {
        return null;
    }

    const row = result[0].values[0];
    return {
        id: row[0],
        opponent_id: row[1],
        description: row[2]
    };
}

/**
 * Загружает карты игрока из хранилища данных
 * @returns {Promise<Array>}
 */
async function loadPlayerCards() {
    const userData = await window.userCards.getUserData();

    if (!userData || !Array.isArray(userData.cards)) {
        return [];
    }

    // Находим все карты игрока (cardholder_id = 1)
    return userData.cards.filter(card => card.cardholder_id === 1);
}

/**
 * Обновляет отображение блока "Данные об оппоненте"
 */
function updateOpponentInfoDisplay() {
    const nameEl = document.getElementById('opponentName');
    const powerEl = document.getElementById('opponentPower');
    const deckDescEl = document.getElementById('opponentDeckDesc');

    if (handSetupState.opponentData) {
        nameEl.textContent = handSetupState.opponentData.name;
        powerEl.textContent = `Уровень ${handSetupState.opponentData.sequence}`;
    } else {
        nameEl.textContent = 'Не найден';
        powerEl.textContent = '-';
    }

    if (handSetupState.deckRuleData) {
        deckDescEl.textContent = handSetupState.deckRuleData.description;
    } else {
        deckDescEl.textContent = 'Нет данных';
    }
}

/**
 * Создает DOM-элемент карты для отображения
 * @param {Object} card - Данные карты
 * @param {boolean} draggable - Можно ли перетаскивать
 * @returns {HTMLElement}
 */
function createCardElement(card, draggable = true) {
    const params = {
        cardTypeId: card.cardTypeId,
        arrowTopLeft: card.arrowTopLeft,
        arrowTop: card.arrowTop,
        arrowTopRight: card.arrowTopRight,
        arrowRight: card.arrowRight,
        arrowBottomRight: card.arrowBottomRight,
        arrowBottom: card.arrowBottom,
        arrowBottomLeft: card.arrowBottomLeft,
        arrowLeft: card.arrowLeft,
        ownership: card.ownership || 'player',
        cardLevel: String(card.cardLevel || 1),
        attackLevel: String(card.attackLevel || 0),
        attackType: card.attackType || 'P',
        mechanicalDefense: String(card.mechanicalDefense || 0),
        electricalDefense: String(card.electricalDefense || 0)
    };

    const cardElement = window.cardRenderer.renderCard(params);
    cardElement.dataset.cardId = card.id;

    if (draggable) {
        cardElement.draggable = true;
        cardElement.classList.add('draggable-card');

        cardElement.addEventListener('dragstart', handleDragStart);
        cardElement.addEventListener('dragend', handleDragEnd);
    }

    return cardElement;
}

/**
 * Обработчик начала перетаскивания
 * @param {DragEvent} e
 */
function handleDragStart(e) {
    const cardEl = e.target.closest('.game-card');
    if (!cardEl) return;

    handSetupState.draggedCard = cardEl;
    handSetupState.draggedFromHand = cardEl.closest('.hand-slot') !== null;

    cardEl.classList.add('dragging');
    e.dataTransfer.setData('text/plain', cardEl.dataset.cardId);
    e.dataTransfer.effectAllowed = 'move';
}

/**
 * Обработчик окончания перетаскивания
 * @param {DragEvent} e
 */
function handleDragEnd(e) {
    const cardEl = e.target.closest('.game-card');
    if (cardEl) {
        cardEl.classList.remove('dragging');
    }
    handSetupState.draggedCard = null;
    handSetupState.draggedFromHand = false;

    // Убираем подсветку со всех слотов и колоды
    document.querySelectorAll('.hand-slot').forEach(slot => {
        slot.classList.remove('drag-over');
    });
    document.getElementById('deckContainer')?.classList.remove('drag-over');
}

/**
 * Обработчик перетаскивания над зоной
 * @param {DragEvent} e
 */
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

/**
 * Обработчик входа в зону
 * @param {DragEvent} e
 */
function handleDragEnter(e) {
    e.preventDefault();
    const target = e.currentTarget;
    target.classList.add('drag-over');
}

/**
 * Обработчик выхода из зоны
 * @param {DragEvent} e
 */
function handleDragLeave(e) {
    const target = e.currentTarget;
    // Проверяем, что мы действительно покинули элемент
    if (!target.contains(e.relatedTarget)) {
        target.classList.remove('drag-over');
    }
}

/**
 * Обработчик сброса карты в слот руки
 * @param {DragEvent} e
 */
async function handleSlotDrop(e) {
    e.preventDefault();
    const slot = e.currentTarget;
    slot.classList.remove('drag-over');

    const cardId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!cardId) return;

    // Если карта уже в руке и перетаскивается в другой слот
    if (handSetupState.draggedFromHand) {
        // Просто переместить визуально - не меняем состояние
        return;
    }

    // Проверяем, что слот пустой и в руке меньше 5 карт
    if (!slot.classList.contains('empty')) {
        return;
    }

    if (handSetupState.handCards.length >= HAND_SIZE) {
        console.warn('Рука уже заполнена');
        return;
    }

    // Находим карту в колоде
    const cardIndex = handSetupState.deckCards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    const card = handSetupState.deckCards[cardIndex];

    // Перемещаем карту из колоды в руку
    handSetupState.deckCards.splice(cardIndex, 1);
    card.inHand = true;
    handSetupState.handCards.push(card);

    // Обновляем хранилище
    await saveCardInHandState(card.id, true);

    // Перерисовываем блоки
    renderDeckCards();
    renderHandCards();
    updateStartButtonState();
}

/**
 * Обработчик сброса карты обратно в колоду
 * @param {DragEvent} e
 */
async function handleDeckDrop(e) {
    e.preventDefault();
    const container = e.currentTarget;
    container.classList.remove('drag-over');

    const cardId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!cardId) return;

    // Если карта из колоды - ничего не делаем
    if (!handSetupState.draggedFromHand) {
        return;
    }

    // Находим карту в руке
    const cardIndex = handSetupState.handCards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;

    const card = handSetupState.handCards[cardIndex];

    // Перемещаем карту из руки в колоду
    handSetupState.handCards.splice(cardIndex, 1);
    card.inHand = false;
    handSetupState.deckCards.push(card);

    // Обновляем хранилище
    await saveCardInHandState(card.id, false);

    // Перерисовываем блоки
    renderDeckCards();
    renderHandCards();
    updateStartButtonState();
}

/**
 * Сохраняет состояние inHand для карты в хранилище
 * @param {number} cardId
 * @param {boolean} inHand
 */
async function saveCardInHandState(cardId, inHand) {
    const userData = await window.userCards.getUserData();

    if (!userData || !Array.isArray(userData.cards)) {
        return;
    }

    const card = userData.cards.find(c => c.id === cardId);
    if (card) {
        card.inHand = inHand;
        await window.userCards.saveUserData(userData);
        console.log(`Карта ${cardId}: inHand = ${inHand}`);
    }
}

/**
 * Отрисовывает карты в блоке "Колода"
 */
function renderDeckCards() {
    const container = document.getElementById('deckContainer');
    if (!container) return;

    container.innerHTML = '';

    if (handSetupState.deckCards.length === 0) {
        container.innerHTML = '<div class="empty-message">Колода пуста</div>';
        return;
    }

    handSetupState.deckCards.forEach(card => {
        const cardElement = createCardElement(card, true);
        container.appendChild(cardElement);
    });
}

/**
 * Отрисовывает карты в блоке "Рука"
 */
function renderHandCards() {
    const slotsContainer = document.getElementById('handSlots');
    if (!slotsContainer) return;

    // Очищаем слоты
    const slots = slotsContainer.querySelectorAll('.hand-slot');
    slots.forEach((slot, index) => {
        slot.innerHTML = '';
        slot.classList.add('empty');

        // Добавляем placeholder
        const placeholder = document.createElement('span');
        placeholder.className = 'slot-placeholder';
        placeholder.textContent = `Слот ${index + 1}`;
        slot.appendChild(placeholder);
    });

    // Заполняем слоты картами из руки
    handSetupState.handCards.forEach((card, index) => {
        if (index < slots.length) {
            const slot = slots[index];
            slot.innerHTML = '';
            slot.classList.remove('empty');

            const cardElement = createCardElement(card, true);
            slot.appendChild(cardElement);
        }
    });

    // Обновляем счетчик
    updateHandCounter();
}

/**
 * Обновляет счетчик карт в руке
 */
function updateHandCounter() {
    const counter = document.getElementById('handCounter');
    if (counter) {
        counter.textContent = `(${handSetupState.handCards.length}/${HAND_SIZE})`;
    }
}

/**
 * Обновляет состояние кнопки "Начать игру"
 */
function updateStartButtonState() {
    const startBtn = document.getElementById('startGameBtn');
    if (startBtn) {
        startBtn.disabled = handSetupState.handCards.length !== HAND_SIZE;
    }
}

/**
 * Обработчик клика на "Собрать руку автоматически"
 */
async function handleAutoCollect() {
    console.log('AutoCollect: Запуск автоматического сбора руки...');

    // Получаем все карты игрока (объединяем колоду и руку)
    const allCards = [...handSetupState.deckCards, ...handSetupState.handCards];

    if (allCards.length < HAND_SIZE) {
        console.warn(`AutoCollect: Недостаточно карт (${allCards.length} < ${HAND_SIZE})`);
        alert(`Недостаточно карт для сбора руки. Нужно минимум ${HAND_SIZE} карт.`);
        return;
    }

    // Запускаем autoHandCollector
    const result = window.autoHandCollector.collectHand(allCards);
    console.log('AutoCollect: Результат:', result);

    // Получаем id выбранных карт
    const selectedIds = new Set(result.map(r => r.id));

    // Обновляем состояние: разделяем карты на руку и колоду
    const newHandCards = [];
    const newDeckCards = [];

    allCards.forEach(card => {
        if (selectedIds.has(card.id)) {
            card.inHand = true;
            newHandCards.push(card);
        } else {
            card.inHand = false;
            newDeckCards.push(card);
        }
    });

    handSetupState.handCards = newHandCards;
    handSetupState.deckCards = newDeckCards;

    // Сохраняем в хранилище
    const userData = await window.userCards.getUserData();
    if (userData && Array.isArray(userData.cards)) {
        userData.cards.forEach(card => {
            if (card.cardholder_id === 1) {
                card.inHand = selectedIds.has(card.id);
            }
        });
        await window.userCards.saveUserData(userData);
        console.log('AutoCollect: Данные сохранены в хранилище');
    }

    // Перерисовываем блоки
    renderDeckCards();
    renderHandCards();
    updateStartButtonState();
}

/**
 * Обработчик клика на "Начать игру"
 * @returns {Array<number>} - Список идентификаторов карт из руки
 */
function handleStartGame() {
    if (handSetupState.handCards.length !== HAND_SIZE) {
        console.warn('Нельзя начать игру: рука не заполнена');
        return [];
    }

    const handCardIds = handSetupState.handCards.map(card => card.id);
    console.log('Начало игры с картами:', handCardIds);

    if (isPartyFlow() && window.partyOrchestrator?.finish) {
        window.partyOrchestrator.finish(handSetupState.opponentId).catch(error => {
            console.error('PartyOrchestrator: ошибка завершения подготовки партии', error);
            alert(error?.message || 'Не удалось запустить партию.');
        });
        return handCardIds;
    }

    return handCardIds;
}

/**
 * Настраивает обработчики событий для drag-and-drop
 */
function setupDragAndDrop() {
    // Настраиваем слоты руки
    const slots = document.querySelectorAll('.hand-slot');
    slots.forEach(slot => {
        slot.addEventListener('dragover', handleDragOver);
        slot.addEventListener('dragenter', handleDragEnter);
        slot.addEventListener('dragleave', handleDragLeave);
        slot.addEventListener('drop', handleSlotDrop);
    });

    // Настраиваем контейнер колоды
    const deckContainer = document.getElementById('deckContainer');
    if (deckContainer) {
        deckContainer.addEventListener('dragover', handleDragOver);
        deckContainer.addEventListener('dragenter', handleDragEnter);
        deckContainer.addEventListener('dragleave', handleDragLeave);
        deckContainer.addEventListener('drop', handleDeckDrop);
    }
}

/**
 * Настраивает обработчики кнопок
 */
function setupButtonHandlers() {
    const autoCollectBtn = document.getElementById('autoCollectBtn');
    if (autoCollectBtn) {
        autoCollectBtn.addEventListener('click', handleAutoCollect);
    }

    const startGameBtn = document.getElementById('startGameBtn');
    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            const cardIds = handleStartGame();
            if (cardIds.length === HAND_SIZE) {
                if (!isPartyFlow()) {
                    alert(`Игра начинается с картами: ${cardIds.join(', ')}`);
                }
            }
        });
    }
}

/**
 * Главная функция инициализации экрана
 */
async function initHandSetupScreen() {
    console.log('HandSetup: Инициализация экрана настройки руки...');

    // Получаем id оппонента из URL
    handSetupState.opponentId = getOpponentIdFromUrl();

    if (!handSetupState.opponentId) {
        console.error('HandSetup: Не указан идентификатор оппонента');
        document.getElementById('opponentName').textContent = 'Ошибка: не указан оппонент';
        return;
    }

    console.log(`HandSetup: Идентификатор оппонента: ${handSetupState.opponentId}`);

    try {
        // Ждем инициализации контроллера хранилища
        if (window.userCards?.whenReady) {
            await window.userCards.whenReady();
        }

        const userDataSnapshot = await window.userCards?.getUserData?.();
        console.log('HandSetup: Структура данных из хранилища:');
        console.log(JSON.stringify(userDataSnapshot, null, 2));

        // Инициализируем рендерер карт
        await window.cardRenderer.init();

        // Загружаем данные параллельно
        const [opponentData, deckRuleData, playerCards] = await Promise.all([
            getOpponentData(handSetupState.opponentId),
            getDeckRuleData(handSetupState.opponentId),
            loadPlayerCards()
        ]);

        handSetupState.opponentData = opponentData;
        handSetupState.deckRuleData = deckRuleData;
        handSetupState.playerCards = playerCards;

        // Разделяем карты на руку и колоду
        handSetupState.deckCards = playerCards.filter(c => !c.inHand);
        handSetupState.handCards = playerCards.filter(c => c.inHand);

        console.log(`HandSetup: Загружено карт - колода: ${handSetupState.deckCards.length}, рука: ${handSetupState.handCards.length}`);

        // Обновляем отображение
        updateOpponentInfoDisplay();
        renderDeckCards();
        renderHandCards();
        updateStartButtonState();

        // Настраиваем drag-and-drop и кнопки
        setupDragAndDrop();
        setupButtonHandlers();

        console.log('HandSetup: Инициализация завершена');

    } catch (error) {
        console.error('HandSetup: Ошибка инициализации:', error);
        document.getElementById('opponentName').textContent = 'Ошибка загрузки';
        document.getElementById('deckContainer').innerHTML =
            `<div class="error">Ошибка загрузки: ${error.message}</div>`;
    }
}

// Экспортируем функции в глобальную область
window.handSetup = {
    init: initHandSetupScreen,
    getHandCardIds: () => handSetupState.handCards.map(c => c.id),
    getState: () => ({ ...handSetupState }),
    autoCollect: handleAutoCollect,
    startGame: handleStartGame
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', initHandSetupScreen);
