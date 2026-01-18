/**
 * Yandex Games SDK integration helpers.
 * @typedef {import('ysdk').SDK} SDK
 * @typedef {import('ysdk').Player} Player
 */

const USER_CARDS_STORAGE_KEY = 'technomaster.cards.count';

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
 * Главная функция получения количества карт.
 * @returns {Promise<number>}
 */
async function getUserCardCount() {
    if (isRunningInYandexGames()) {
        return getCardCountFromYandexCloud();
    }

    return getCardCountFromBrowser();
}

window.userCards = {
    getUserCardCount,
    isRunningInYandexGames
};
