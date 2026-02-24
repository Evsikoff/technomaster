/**
 * Yandex Games SDK integration helpers.
 * Контроллер хранилища пользовательских данных.
 * @typedef {import('ysdk').SDK} SDK
 * @typedef {import('ysdk').Player} Player
 */

const USER_DATA_STORAGE_KEY = 'technomaster.userData';

/**
 * Глобальная переменная типа хранилища данных.
 * Значения: "yandexCloud" | "localStorage"
 * @type {string}
 */
let userDataStorage = 'localStorage';

/**
 * Кэшированные данные пользователя для быстрого доступа.
 * @type {object|null}
 */
let cachedUserData = null;

/**
 * Кэшированный результат проверки среды Яндекс Игр.
 * @type {boolean|null}
 */
let isYandexGamesEnvironment = null;

/**
 * Кэшированный экземпляр Yandex SDK.
 * @type {SDK|null}
 */
let cachedYsdk = null;

/**
 * Promise инициализации контроллера.
 * @type {Promise<object>|null}
 */
let initPromiseInstance = null;

/**
 * Флаг завершения инициализации.
 * @type {boolean}
 */
let isInitialized = false;

/**
 * Быстрая синхронная проверка признаков Яндекс Игр (без гарантии).
 * @returns {boolean}
 */
function hasYandexGamesIndicators() {
    try {
        // Проверяем хост
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        const looksLikeYandexHost = host.endsWith('yandex.ru') || host.endsWith('yandex.net');

        if (looksLikeYandexHost) {
            return true;
        }

        // Проверяем, запущены ли мы в iframe.
        // В Яндекс Играх приложение всегда работает в iframe.
        const isInIframe = window !== window.top;
        if (isInIframe) {
            return true;
        }

        // Проверяем реферер (для первого входа)
        const referrer = typeof document !== 'undefined' ? document.referrer : '';
        const hasYandexReferrer = referrer.includes('yandex.ru') || referrer.includes('yandex.net');

        return hasYandexReferrer;
    } catch (e) {
        return false;
    }
}

/**
 * Проверяет, запущена ли игра через iframe в сервисе Яндекс Игры.
 * Сначала проверяет глобальную переменную userDataStorage.
 * @returns {Promise<boolean>}
 */
async function checkYandexGamesEnvironment() {
    // Возвращаем кэшированный результат, если уже проверяли
    if (isYandexGamesEnvironment !== null) {
        return isYandexGamesEnvironment;
    }

    // Проверяем глобальную переменную окружения userDataStorage
    if (typeof window !== 'undefined' && window.userDataStorage === 'localStorage') {
        console.log('Yandex Games: Найдена переменная окружения userDataStorage = "localStorage".');
        console.log('Yandex Games: Принудительно используется localStorage.');
        isYandexGamesEnvironment = false;
        return false;
    }

    // Проверяем наличие SDK
    if (typeof window === 'undefined' || typeof window.YaGames?.init !== 'function') {
        console.log('Yandex Games: SDK не найден на странице.');
        isYandexGamesEnvironment = false;
        return false;
    }

    // SDK есть, но нужно проверить, работает ли он реально
    // (ошибка "No parent to post message" означает, что нет родительского iframe)
    try {
        console.log('Yandex Games: Попытка инициализации SDK...');

        // Устанавливаем таймаут на инициализацию (5 секунд)
        // Инициализация с параметром signed: false (по умолчанию)
        const initPromise = window.YaGames.init({ signed: false });
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('SDK init timeout')), 5000);
        });

        cachedYsdk = await Promise.race([initPromise, timeoutPromise]);

        // Если дошли сюда - SDK успешно инициализирован
        console.log('Yandex Games: SDK успешно инициализирован. Игра запущена на Яндекс Играх.');
        isYandexGamesEnvironment = true;
        return true;

    } catch (error) {
        // Ошибка инициализации - не на Яндекс Играх
        const errorMessage = error?.message || String(error);
        console.log(`Yandex Games: Ошибка инициализации SDK: "${errorMessage}"`);
        console.log('Yandex Games: Игра запущена НЕ на Яндекс Играх.');
        isYandexGamesEnvironment = false;
        cachedYsdk = null;
        return false;
    }
}

/**
 * Синхронная проверка (использует кэшированный результат).
 * ВАЖНО: Вызывать только после checkYandexGamesEnvironment()!
 * @returns {boolean}
 */
function isRunningInYandexGames() {
    if (isYandexGamesEnvironment !== null) {
        return isYandexGamesEnvironment;
    }
    // Если ещё не проверяли асинхронно - возвращаем false по умолчанию
    console.warn('isRunningInYandexGames: вызван до асинхронной проверки, возвращаю false.');
    return false;
}

/**
 * Возвращает кэшированный экземпляр Yandex SDK (если доступен).
 * @returns {SDK|null}
 */
function getCachedYsdk() {
    return cachedYsdk;
}

/**
 * Создаёт пустую структуру данных пользователя по схеме.
 * @returns {object}
 */
function createEmptyUserDataStructure() {
    return {
        cardholders: [],
        cards: [],
        parties: []
    };
}

/**
 * Создаёт начальную структуру данных пользователя с первым cardholder.
 * @returns {object}
 */
function createInitialUserDataStructure() {
    const data = createEmptyUserDataStructure();

    // Добавляем первый cardholder для игрока
    data.cardholders.push({
        id: 1,
        player: true,
        opponent_id: null
    });

    return data;
}

/**
 * Валидирует структуру данных пользователя.
 * @param {unknown} data - Данные для проверки
 * @returns {boolean}
 */
function isValidUserDataStructure(data) {
    if (!data || typeof data !== 'object') {
        return false;
    }

    // Проверяем наличие основных массивов
    if (!Array.isArray(data.cardholders)) {
        return false;
    }
    if (!Array.isArray(data.cards)) {
        return false;
    }
    if (!Array.isArray(data.parties)) {
        return false;
    }

    return true;
}

/**
 * Получает данные пользователя из localStorage.
 * @returns {object|null}
 */
function getUserDataFromLocalStorage() {
    try {
        const storedData = localStorage.getItem(USER_DATA_STORAGE_KEY);
        if (!storedData) {
            return null;
        }

        const parsed = JSON.parse(storedData);
        if (isValidUserDataStructure(parsed)) {
            return parsed;
        }

        console.warn('Browser: структура данных в localStorage некорректна.');
        return null;
    } catch (e) {
        console.error('Browser: ошибка чтения данных из localStorage.', e);
        return null;
    }
}

/**
 * Сохраняет данные пользователя в localStorage.
 * @param {object} data - Данные для сохранения
 * @returns {boolean}
 */
function saveUserDataToLocalStorage(data) {
    try {
        localStorage.setItem(USER_DATA_STORAGE_KEY, JSON.stringify(data));
        return true;
    } catch (e) {
        console.error('Browser: ошибка сохранения данных в localStorage.', e);
        return false;
    }
}

/**
 * Получает данные пользователя из Яндекс Облака.
 * @returns {Promise<object|null>}
 */
async function getUserDataFromYandexCloud() {
    // Используем кэшированный SDK или пытаемся получить его
    let ysdk = getCachedYsdk();

    if (!ysdk) {
        // Попытка инициализации, если ещё не было
        const isYandex = await checkYandexGamesEnvironment();
        if (!isYandex) {
            console.warn('Yandex Games: SDK не доступен (не на Яндекс Играх).');
            return null;
        }
        ysdk = getCachedYsdk();
    }

    if (!ysdk) {
        console.warn('Yandex Games: SDK не инициализирован.');
        return null;
    }

    try {
        /** @type {Player} */
        const player = await ysdk.getPlayer();
        const data = await player.getData(['userData']);

        if (data && data.userData && isValidUserDataStructure(data.userData)) {
            return data.userData;
        }

        return null;
    } catch (e) {
        console.error('Yandex Games: ошибка получения данных из облака.', e);
        return null;
    }
}

/**
 * Сохраняет данные пользователя в Яндекс Облако.
 * @param {object} data - Данные для сохранения
 * @returns {Promise<boolean>}
 */
async function saveUserDataToYandexCloud(data) {
    // Используем кэшированный SDK
    const ysdk = getCachedYsdk();

    if (!ysdk) {
        console.warn('Yandex Games: SDK не инициализирован для сохранения.');
        return false;
    }

    let payloadSizeBytes = -1;

    try {
        const serializedData = JSON.stringify(data);
        payloadSizeBytes = new TextEncoder().encode(serializedData).length;
    } catch (serializationError) {
        console.error('Yandex Games: ошибка сериализации данных перед сохранением.', {
            payloadType: typeof data,
            payloadSizeBytes,
            message: serializationError?.message,
            stack: serializationError?.stack,
            error: serializationError
        });
        return false;
    }

    try {
        /** @type {Player} */
        const player = await ysdk.getPlayer();
        await player.setData({ userData: data });
        console.log('Yandex Games: данные успешно сохранены в облако.', { payloadSizeBytes });
        return true;
    } catch (e) {
        const isSdkOrNetworkIssue = !navigator.onLine || /network|timeout|fetch|sdk|getPlayer|setData/i.test(String(e?.message || ''));
        console.error(
            isSdkOrNetworkIssue
                ? 'Yandex Games: ошибка SDK/сети при сохранении данных в облако.'
                : 'Yandex Games: ошибка данных/валидации при сохранении в облако.',
            {
                payloadSizeBytes,
                online: navigator.onLine,
                message: e?.message,
                stack: e?.stack,
                error: e
            }
        );
        return false;
    }
}

/**
 * Внутренняя функция получения данных из хранилища без ожидания инициализации контроллера.
 * @returns {Promise<object|null>}
 */
async function fetchUserDataInternal() {
    let data = null;

    if (userDataStorage === 'yandexCloud') {
        data = await getUserDataFromYandexCloud();
    } else {
        data = getUserDataFromLocalStorage();
    }

    return data;
}

/**
 * Получает данные пользователя из соответствующего хранилища.
 * Гарантирует завершение инициализации контроллера.
 * @returns {Promise<object|null>}
 */
async function getUserData() {
    if (isInitialized && cachedUserData) {
        return cachedUserData;
    }
    return await whenReady();
}

/**
 * Сохраняет данные пользователя в соответствующее хранилище.
 * @param {object} data - Данные для сохранения
 * @returns {Promise<boolean>}
 */
async function saveUserData(data) {
    cachedUserData = data;

    // Всегда сохраняем в localStorage как резервную копию
    saveUserDataToLocalStorage(data);

    if (userDataStorage === 'yandexCloud') {
        return await saveUserDataToYandexCloud(data);
    }

    return true;
}

/**
 * Контроллер хранилища пользовательских данных.
 * Определяет тип хранилища и инициализирует структуру данных.
 * @returns {Promise<object>}
 */
async function initUserDataStorageController() {
    console.log('=== Инициализация контроллера хранилища данных ===');

    // Шаг 1: Определяем среду запуска (асинхронная проверка с реальной инициализацией SDK)
    const isYandex = await checkYandexGamesEnvironment();

    if (isYandex) {
        console.log('Игра запущена на Яндекс Играх');
        userDataStorage = 'yandexCloud';
    } else {
        console.log('Игра запущена не на Яндекс Играх');
        userDataStorage = 'localStorage';
    }

    console.log(`Тип хранилища: ${userDataStorage}`);

    // Шаг 2: Проверяем наличие структуры данных
    let userData = await fetchUserDataInternal();

    if (!userData || !isValidUserDataStructure(userData)) {
        // Структура отсутствует - создаём новую
        console.log('Структура данных не найдена в хранилище. Создаю новую структуру...');

        userData = createInitialUserDataStructure();

        // Сохраняем созданную структуру
        const saved = await saveUserData(userData);
        if (saved) {
            console.log('Структура данных успешно создана и сохранена.');
        } else {
            console.warn('Не удалось сохранить структуру данных.');
        }

        console.log('Созданная структура данных:');
        console.log(JSON.stringify(userData, null, 2));
    } else {
        // Структура существует - выводим её
        console.log('Структура данных найдена в хранилище:');
        console.log(JSON.stringify(userData, null, 2));
    }

    cachedUserData = userData;
    isInitialized = true;

    console.log('=== Инициализация контроллера завершена ===');

    return userData;
}

/**
 * Возвращает Promise, который резолвится когда контроллер полностью инициализирован.
 * Используйте эту функцию перед вызовом getUserCardCount, getMaxOpponentCoolness и т.д.
 * @returns {Promise<object>}
 */
function whenReady() {
    if (isInitialized && cachedUserData) {
        return Promise.resolve(cachedUserData);
    }

    if (initPromiseInstance) {
        return initPromiseInstance;
    }

    // Если инициализация ещё не началась, запускаем её
    initPromiseInstance = initUserDataStorageController();
    return initPromiseInstance;
}

/**
 * Проверяет, завершена ли инициализация контроллера.
 * @returns {boolean}
 */
function isReady() {
    return isInitialized;
}

/**
 * Возвращает текущий тип хранилища данных.
 * @returns {string}
 */
function getStorageType() {
    return userDataStorage;
}

// ========================================
// Функции для работы с картами (переписаны)
// ========================================

/**
 * Получает количество карт у пользователя из структуры данных.
 * Карты считаются для cardholder с player = true.
 * @returns {Promise<number>}
 */
async function getUserCardCount() {
    const userData = await getUserData();

    if (!userData || !isValidUserDataStructure(userData)) {
        console.log('getUserCardCount: структура данных не найдена, возвращаю 0.');
        return 0;
    }

    // Находим cardholder игрока
    const playerCardholder = userData.cardholders.find(ch => ch.player === true);

    if (!playerCardholder) {
        console.log('getUserCardCount: cardholder игрока не найден, возвращаю 0.');
        return 0;
    }

    // Считаем карты, принадлежащие игроку (по cardholder_id)
    const playerCards = userData.cards.filter(card => card.cardholder_id === playerCardholder.id);
    const count = playerCards.length;

    console.log(`getUserCardCount: найдено карт у игрока: ${count}`);
    return count;
}

/**
 * Получает максимальный уровень крутости (opponent_power) побеждённого оппонента для каждого режима.
 * Находит максимальный opponent_power среди партий, где win = true.
 * @returns {Promise<{standard: number, hard: number, hardcore: number}>}
 */
async function getMaxOpponentCoolness() {
    const userData = await getUserData();
    const result = { standard: 0, hard: 0, hardcore: 0 };

    if (!userData || !isValidUserDataStructure(userData)) {
        console.log('getMaxOpponentCoolness: структура данных не найдена.');
        return result;
    }

    // Находим все выигранные партии
    const wonParties = userData.parties.filter(party => party.win === true);

    if (wonParties.length === 0) {
        console.log('getMaxOpponentCoolness: выигранных партий не найдено.');
        return result;
    }

    // Находим максимальный opponent_power среди выигранных партий для каждого режима
    for (const party of wonParties) {
        const mode = party.gameMode || 'standard';
        const power = typeof party.opponent_power === 'number' ? party.opponent_power : 0;

        if (result[mode] !== undefined) {
            if (power > result[mode]) {
                result[mode] = power;
            }
        } else {
            // Если режим неизвестен, считаем его стандартным для совместимости
            if (power > result.standard) {
                result.standard = power;
            }
        }
    }

    console.log('getMaxOpponentCoolness:', result);
    return result;
}

// ========================================
// Функции для работы с колодой карт
// ========================================

/**
 * Сохраняет колоду карт пользователя в новую структуру данных.
 * @param {Array} cards - Массив карт для сохранения
 * @returns {Promise<boolean>}
 */
async function saveUserDeck(cards) {
    if (!Array.isArray(cards)) {
        console.error('saveUserDeck: cards должен быть массивом');
        return false;
    }

    let userData = await getUserData();

    if (!userData || !isValidUserDataStructure(userData)) {
        userData = createInitialUserDataStructure();
    }

    // Находим cardholder игрока
    let playerCardholder = userData.cardholders.find(ch => ch.player === true);

    if (!playerCardholder) {
        // Создаём cardholder для игрока, если его нет
        playerCardholder = {
            id: 1,
            player: true,
            opponent_id: null
        };
        userData.cardholders.push(playerCardholder);
    }

    // Удаляем старые карты игрока
    userData.cards = userData.cards.filter(card => card.cardholder_id !== playerCardholder.id);

    // Добавляем новые карты с привязкой к cardholder игрока
    // Генерируем уникальные ID для карт
    let maxCardId = userData.cards.reduce((max, card) => Math.max(max, card.id || 0), 0);

    const newCards = cards.map((card, index) => {
        maxCardId++;
        return {
            id: maxCardId,
            cardholder_id: playerCardholder.id,
            cardTypeId: card.cardTypeId || card.renderParams?.cardTypeId || index + 1,
            arrowTopLeft: card.arrowTopLeft || card.renderParams?.arrowTopLeft || false,
            arrowTop: card.arrowTop || card.renderParams?.arrowTop || false,
            arrowTopRight: card.arrowTopRight || card.renderParams?.arrowTopRight || false,
            arrowRight: card.arrowRight || card.renderParams?.arrowRight || false,
            arrowBottomRight: card.arrowBottomRight || card.renderParams?.arrowBottomRight || false,
            arrowBottom: card.arrowBottom || card.renderParams?.arrowBottom || false,
            arrowBottomLeft: card.arrowBottomLeft || card.renderParams?.arrowBottomLeft || false,
            arrowLeft: card.arrowLeft || card.renderParams?.arrowLeft || false,
            ownership: 'player',
            cardLevel: card.cardLevel || card.renderParams?.cardLevel || 1,
            attackLevel: card.attackLevel || card.renderParams?.attackLevel || 0,
            attackType: card.attackType || card.renderParams?.attackType || '',
            mechanicalDefense: card.mechanicalDefense || card.renderParams?.mechanicalDefense || 0,
            electricalDefense: card.electricalDefense || card.renderParams?.electricalDefense || 0,
            inHand: card.inHand !== undefined ? card.inHand : false
        };
    });

    userData.cards = userData.cards.concat(newCards);

    const saved = await saveUserData(userData);

    if (saved) {
        console.log(`saveUserDeck: сохранено карт: ${newCards.length}`);
    }

    return saved;
}

/**
 * Записывает результат партии.
 * @param {number} opponentId - ID оппонента
 * @param {boolean} win - Победа или поражение
 * @param {number} opponentPower - Уровень крутости оппонента
 * @param {string} gameMode - Режим игры ('standard', 'hard', 'hardcore')
 * @returns {Promise<boolean>}
 */
async function recordPartyResult(opponentId, win, opponentPower, gameMode = 'standard') {
    let userData = await getUserData();

    if (!userData || !isValidUserDataStructure(userData)) {
        userData = createInitialUserDataStructure();
    }

    // Генерируем ID для новой партии
    const maxPartyId = userData.parties.reduce((max, party) => Math.max(max, party.id || 0), 0);

    const newParty = {
        id: maxPartyId + 1,
        opponent_id: opponentId,
        win: win,
        opponent_power: opponentPower,
        gameMode: gameMode,
        date: new Date().toISOString()
    };

    userData.parties.push(newParty);

    const saved = await saveUserData(userData);

    if (saved) {
        console.log(`recordPartyResult: записана партия #${newParty.id}, победа: ${win}, крутость оппонента: ${opponentPower}, режим: ${gameMode}`);
    }

    return saved;
}

/**
 * Добавляет карту в колоду пользователя.
 * @param {object} cardData - Данные карты
 * @returns {Promise<boolean>}
 */
async function addCardToUserDeck(cardData) {
    let userData = await getUserData();

    if (!userData || !isValidUserDataStructure(userData)) {
        userData = createInitialUserDataStructure();
    }

    // Находим cardholder игрока
    let playerCardholder = userData.cardholders.find(ch => ch.player === true);

    if (!playerCardholder) {
        playerCardholder = {
            id: 1,
            player: true,
            opponent_id: null
        };
        userData.cardholders.push(playerCardholder);
    }

    // Генерируем ID для новой карты
    const maxCardId = userData.cards.reduce((max, card) => Math.max(max, card.id || 0), 0);

    const newCard = {
        id: maxCardId + 1,
        cardholder_id: playerCardholder.id,
        cardTypeId: cardData.cardTypeId || cardData.renderParams?.cardTypeId || 1,
        arrowTopLeft: cardData.arrowTopLeft || cardData.renderParams?.arrowTopLeft || false,
        arrowTop: cardData.arrowTop || cardData.renderParams?.arrowTop || false,
        arrowTopRight: cardData.arrowTopRight || cardData.renderParams?.arrowTopRight || false,
        arrowRight: cardData.arrowRight || cardData.renderParams?.arrowRight || false,
        arrowBottomRight: cardData.arrowBottomRight || cardData.renderParams?.arrowBottomRight || false,
        arrowBottom: cardData.arrowBottom || cardData.renderParams?.arrowBottom || false,
        arrowBottomLeft: cardData.arrowBottomLeft || cardData.renderParams?.arrowBottomLeft || false,
        arrowLeft: cardData.arrowLeft || cardData.renderParams?.arrowLeft || false,
        ownership: 'player',
        cardLevel: cardData.cardLevel || cardData.renderParams?.cardLevel || 1,
        attackLevel: cardData.attackLevel || cardData.renderParams?.attackLevel || 0,
        attackType: cardData.attackType || cardData.renderParams?.attackType || '',
        mechanicalDefense: cardData.mechanicalDefense || cardData.renderParams?.mechanicalDefense || 0,
        electricalDefense: cardData.electricalDefense || cardData.renderParams?.electricalDefense || 0,
        inHand: false
    };

    userData.cards.push(newCard);

    const saved = await saveUserData(userData);

    if (saved) {
        console.log(`addCardToUserDeck: добавлена карта #${newCard.id}`);
    }

    return saved;
}

/**
 * Очищает кэш данных пользователя.
 * Полезно для принудительного перечитывания из хранилища.
 */
function clearUserDataCache() {
    cachedUserData = null;
    console.log('Кэш данных пользователя очищен.');
}

// ========================================
// Функция повышения уровня карты
// ========================================

/**
 * Функция технической замены карты на уровень выше.
 * Использует существующую логику генерации карт через cardRenderer.generateCardParams.
 *
 * @param {number} oldCardId - ID заменяемой карты
 * @param {object} userData - Объект данных пользователя
 * @param {object} cardGenerator - Ссылка на модуль генерации (cardRenderer)
 * @returns {object} - Результат операции
 */
function processCardLevelUp(oldCardId, userData, cardGenerator) {
    // Шаг 1: Валидация и подготовка
    if (!userData || !Array.isArray(userData.cards)) {
        return { status: 'error', message: 'Некорректная структура userData' };
    }

    if (!cardGenerator || typeof cardGenerator.generateCardParams !== 'function') {
        return { status: 'error', message: 'cardGenerator не предоставлен или не имеет метода generateCardParams' };
    }

    const cardIndex = userData.cards.findIndex(c => c.id === oldCardId);
    if (cardIndex === -1) {
        return { status: 'error', message: 'Card not found' };
    }

    const oldCard = userData.cards[cardIndex];
    const currentLevel = parseInt(oldCard.cardLevel, 10);

    // Проверка максимального уровня (0, 1, 2 - три уровня, максимум 2)
    if (currentLevel >= 2) {
        return { status: 'skipped', message: 'Карта уже максимального уровня' };
    }

    const targetLevel = currentLevel + 1;

    // Шаг 2: Генерация новых параметров карты через существующую функцию
    let newStats;
    try {
        newStats = cardGenerator.generateCardParams(oldCard.cardTypeId, targetLevel);
    } catch (error) {
        return {
            status: 'error',
            message: `Ошибка генерации параметров карты: ${error.message}`
        };
    }

    // Шаг 3: Генерация нового ID
    const maxId = userData.cards.reduce((max, c) => (c.id > max ? c.id : max), 0);
    const newId = maxId + 1;

    // Шаг 4: Сборка объекта новой карты
    const newCard = {
        id: newId,
        cardholder_id: oldCard.cardholder_id,
        cardTypeId: oldCard.cardTypeId,
        cardLevel: targetLevel,
        ownership: 'player',
        inHand: false,

        // Данные из генератора
        attackLevel: newStats.attackLevel,
        attackType: newStats.attackType,
        mechanicalDefense: newStats.mechanicalDefense,
        electricalDefense: newStats.electricalDefense,

        // Стрелки из генератора
        arrowTopLeft: newStats.arrowTopLeft,
        arrowTop: newStats.arrowTop,
        arrowTopRight: newStats.arrowTopRight,
        arrowRight: newStats.arrowRight,
        arrowBottomRight: newStats.arrowBottomRight,
        arrowBottom: newStats.arrowBottom,
        arrowBottomLeft: newStats.arrowBottomLeft,
        arrowLeft: newStats.arrowLeft
    };

    // Шаг 5: Атомарная замена в хранилище
    userData.cards.splice(cardIndex, 1);
    userData.cards.push(newCard);

    // Шаг 6: Возврат данных для оркестратора
    return {
        status: 'success',
        oldCardId: oldCardId,
        newCard: newCard
    };
}

/**
 * Асинхронная обёртка для processCardLevelUp с автоматическим сохранением.
 * Получает userData из хранилища, выполняет операцию и сохраняет результат.
 *
 * @param {number} oldCardId - ID заменяемой карты
 * @param {object} cardGenerator - Ссылка на модуль генерации (cardRenderer)
 * @returns {Promise<object>} - Результат операции
 */
async function processCardLevelUpAndSave(oldCardId, cardGenerator) {
    const userData = await getUserData();

    if (!userData) {
        return { status: 'error', message: 'Не удалось получить данные пользователя' };
    }

    const result = processCardLevelUp(oldCardId, userData, cardGenerator);

    if (result.status === 'success') {
        await saveUserData(userData);
        console.log(`processCardLevelUpAndSave: Карта #${oldCardId} повышена до уровня ${result.newCard.cardLevel}`);
    }

    return result;
}

// Экспорт в глобальную область видимости
/**
 * Инициализирует глобальные блокировки UI (ПКМ, выделение, перетаскивание).
 */
function initGlobalUIBlocking() {
    // Блокировка контекстного меню (ПКМ и долгий тап на мобильных)
    window.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    }, false);

    // Блокировка выделения текста (дополнительно к CSS)
    window.addEventListener('selectstart', (e) => {
        e.preventDefault();
    }, false);

    // Блокировка перетаскивания изображений
    window.addEventListener('dragstart', (e) => {
        // Разрешаем перетаскивание только для игровых карт
        if (e.target.closest('.player-hand-card') || e.target.closest('.draggable-card')) {
            return;
        }
        if (e.target.tagName === 'IMG' || e.target.closest('img')) {
            e.preventDefault();
        }
    }, false);
}

const GAMEPLAY_ACTIVE_KEY = 'technomaster.gameplay.active';

/**
 * Запускает сессию GameplayAPI, если она еще не активна.
 */
function startGameplay() {
    const isYandex = isRunningInYandexGames();
    const ysdk = getCachedYsdk();

    if (isYandex && ysdk && ysdk.features && ysdk.features.GameplayAPI) {
        const isActive = sessionStorage.getItem(GAMEPLAY_ACTIVE_KEY) === '1';
        if (!isActive) {
            console.log('Yandex Games: GameplayAPI.start()');
            ysdk.features.GameplayAPI.start();
            sessionStorage.setItem(GAMEPLAY_ACTIVE_KEY, '1');
        }
    }
}

/**
 * Останавливает сессию GameplayAPI.
 */
function stopGameplay() {
    const isYandex = isRunningInYandexGames();
    const ysdk = getCachedYsdk();

    if (isYandex && ysdk && ysdk.features && ysdk.features.GameplayAPI) {
        console.log('Yandex Games: GameplayAPI.stop()');
        ysdk.features.GameplayAPI.stop();
        sessionStorage.removeItem(GAMEPLAY_ACTIVE_KEY);
    }
}

// Инициализация блокировок при загрузке
if (typeof window !== 'undefined') {
    initGlobalUIBlocking();
}

window.userCards = {
    // Основные функции
    initUserDataStorageController,
    whenReady,
    isReady,
    getUserCardCount,
    getMaxOpponentCoolness,
    saveUserDeck,

    // Дополнительные функции
    getUserData,
    saveUserData,
    recordPartyResult,
    addCardToUserDeck,
    clearUserDataCache,

    // Функции повышения уровня карты
    processCardLevelUp,
    processCardLevelUpAndSave,

    // GameplayAPI
    startGameplay,
    stopGameplay,

    // Утилиты
    checkYandexGamesEnvironment,
    isRunningInYandexGames,
    getCachedYsdk,
    getStorageType,
    createEmptyUserDataStructure,
    createInitialUserDataStructure
};

// Автоматическая инициализация при загрузке скрипта
if (typeof document !== 'undefined') {
    // Запускаем инициализацию и сохраняем Promise
    const startInit = () => {
        initPromiseInstance = initUserDataStorageController();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startInit);
    } else {
        // DOM уже загружен
        startInit();
    }
}
