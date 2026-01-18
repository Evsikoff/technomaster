/**
 * Yandex Games SDK integration helpers.
 * @typedef {import('ysdk').SDK} SDK
 * @typedef {import('ysdk').Player} Player
 */

const USER_CARDS_STORAGE_KEY = 'technomaster.cards.count';
const MAX_OPPONENT_COOLNESS_STORAGE_KEY = 'technomaster.opponent.coolness.max';
const OPPONENT_COOLNESS_WINS_STORAGE_KEY = 'technomaster.opponent.coolness.wins';

/**
 * Проверяет, запущена ли игра через Яндекс Игры.
 * @returns {boolean}
 */
function isRunningInYandexGames() {
    const hasSdk = typeof window !== 'undefined' && typeof window.YaGames?.init === 'function';
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const looksLikeYandexHost = host.endsWith('yandex.ru') || host.endsWith('yandex.net');
    const isYandex = hasSdk || looksLikeYandexHost;

    console.log(`Yandex Games: проверка запуска (SDK=${hasSdk}, host=${host || 'unknown'}): ${isYandex}`);
    return isYandex;
}

/**
 * Определяет количество карт из сохраненных данных.
 * @param {Record<string, unknown>} data
 * @returns {number}
 */
function extractCardCount(data) {
    if (!data || typeof data !== 'object') {
        return 0;
    }

    const possibleCount = data.cardCount;
    if (typeof possibleCount === 'number' && Number.isFinite(possibleCount)) {
        return Math.max(0, Math.floor(possibleCount));
    }

    if (Array.isArray(data.cards)) {
        return data.cards.length;
    }

    return 0;
}

/**
 * Нормализует значение крутости соперника.
 * @param {unknown} value
 * @returns {number}
 */
function normalizeCoolness(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.floor(value));
}

/**
 * Определяет максимальную крутость соперника из сохраненных данных.
 * @param {Record<string, unknown>} data
 * @returns {number}
 */
function extractMaxOpponentCoolness(data) {
    if (!data || typeof data !== 'object') {
        return 0;
    }

    const knownKeys = [
        'maxOpponentCoolness',
        'opponentMaxCoolness',
        'maxOpponentLevel',
        'maxOpponentPower'
    ];

    for (const key of knownKeys) {
        if (key in data) {
            const value = normalizeCoolness(data[key]);
            if (value > 0) {
                return value;
            }
        }
    }

    const winsArray = Array.isArray(data.opponentCoolnessWins)
        ? data.opponentCoolnessWins
        : Array.isArray(data.wins)
            ? data.wins
            : null;

    if (winsArray) {
        let maxCoolness = 0;
        for (const entry of winsArray) {
            if (typeof entry === 'number') {
                maxCoolness = Math.max(maxCoolness, normalizeCoolness(entry));
                continue;
            }

            if (entry && typeof entry === 'object') {
                const value = normalizeCoolness(entry.coolness ?? entry.level ?? entry.power);
                maxCoolness = Math.max(maxCoolness, value);
            }
        }

        return maxCoolness;
    }

    return 0;
}

/**
 * Получает количество карт пользователя из Яндекс Облака.
 * @returns {Promise<number>}
 */
async function getCardCountFromYandexCloud() {
    if (typeof window === 'undefined' || typeof window.YaGames?.init !== 'function') {
        console.warn('Yandex Games: SDK не доступен для проверки облака.');
        return 0;
    }

    try {
        /** @type {SDK} */
        const ysdk = await window.YaGames.init();
        /** @type {Player} */
        const player = await ysdk.getPlayer();
        const data = await player.getData(['cards', 'cardCount']);
        const cardCount = extractCardCount(data);

        if (cardCount === 0) {
            console.log('Yandex Games: облако доступно, но записей о картах нет.');
        } else {
            console.log(`Yandex Games: из облака получено карт: ${cardCount}.`);
        }

        console.log('Yandex Games: проверка облачного прогресса завершена успешно.');
        return cardCount;
    } catch (error) {
        console.error('Yandex Games: ошибка при проверке облачного прогресса.', error);
        return 0;
    }
}

/**
 * Получает максимальную крутость побежденного соперника из Яндекс Облака.
 * @returns {Promise<number>}
 */
async function getMaxOpponentCoolnessFromYandexCloud() {
    if (typeof window === 'undefined' || typeof window.YaGames?.init !== 'function') {
        console.warn('Yandex Games: SDK не доступен для проверки облака.');
        console.error('Yandex Games: проверка облачного прогресса завершилась неудачей.');
        return 0;
    }

    try {
        /** @type {SDK} */
        const ysdk = await window.YaGames.init();
        /** @type {Player} */
        const player = await ysdk.getPlayer();
        const data = await player.getData([
            'wins',
            'opponentCoolnessWins',
            'maxOpponentCoolness',
            'opponentMaxCoolness',
            'maxOpponentLevel',
            'maxOpponentPower'
        ]);
        const maxCoolness = extractMaxOpponentCoolness(data);

        if (maxCoolness === 0) {
            console.log('Yandex Games: облако доступно, но записей о победах нет.');
        } else {
            console.log(`Yandex Games: максимальная крутость побежденного соперника = ${maxCoolness}.`);
        }

        console.log('Yandex Games: проверка облачного прогресса завершена успешно.');
        return maxCoolness;
    } catch (error) {
        console.error('Yandex Games: ошибка при проверке облачного прогресса.', error);
        console.error('Yandex Games: проверка облачного прогресса завершилась неудачей.');
        return 0;
    }
}

/**
 * Получает количество карт пользователя из памяти браузера.
 * @returns {number}
 */
function getCardCountFromBrowser() {
    const storedValue = localStorage.getItem(USER_CARDS_STORAGE_KEY);
    if (!storedValue) {
        console.log('Browser: записи о картах отсутствуют, считаем что карт 0.');
        return 0;
    }

    const parsed = Number.parseInt(storedValue, 10);
    const cardCount = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    console.log(`Browser: количество карт в локальной памяти = ${cardCount}.`);
    return cardCount;
}

/**
 * Получает максимальную крутость побежденного соперника из памяти браузера.
 * @returns {number}
 */
function getMaxOpponentCoolnessFromBrowser() {
    const storedMax = localStorage.getItem(MAX_OPPONENT_COOLNESS_STORAGE_KEY);
    if (storedMax) {
        const parsed = normalizeCoolness(Number.parseInt(storedMax, 10));
        console.log(`Browser: максимальная крутость побежденного соперника = ${parsed}.`);
        return parsed;
    }

    const storedWins = localStorage.getItem(OPPONENT_COOLNESS_WINS_STORAGE_KEY);
    if (!storedWins) {
        console.log('Browser: записи о победах отсутствуют, считаем что крутость 0.');
        return 0;
    }

    try {
        const parsedWins = JSON.parse(storedWins);
        const maxCoolness = extractMaxOpponentCoolness({ wins: parsedWins });
        if (maxCoolness === 0) {
            console.log('Browser: записи о победах отсутствуют, считаем что крутость 0.');
        } else {
            console.log(`Browser: максимальная крутость побежденного соперника = ${maxCoolness}.`);
        }
        return maxCoolness;
    } catch (error) {
        console.warn('Browser: не удалось разобрать записи о победах, считаем что крутость 0.', error);
        return 0;
    }
}

/**
 * Главная функция получения количества карт.
 * @returns {Promise<number>}
 */
async function getUserCardCount() {
    if (isRunningInYandexGames()) {
        return getCardCountFromYandexCloud();
    }

    return getCardCountFromBrowser();
}

/**
 * Главная функция получения максимальной крутости соперника.
 * @returns {Promise<number>}
 */
async function getMaxOpponentCoolness() {
    if (isRunningInYandexGames()) {
        return getMaxOpponentCoolnessFromYandexCloud();
    }

    return getMaxOpponentCoolnessFromBrowser();
}

window.userCards = {
    getUserCardCount,
    getMaxOpponentCoolness,
    isRunningInYandexGames
};
