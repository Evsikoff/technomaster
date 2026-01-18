const OPPONENTS_DB_PATH = 'public/data/cards.db';
const OPPONENTS_AVATAR_PATH = 'public/img/opponents';
const MIN_DECK_PULSE_THRESHOLD = 5;

/**
 * Создает DOM-элемент бейджа соперника.
 * @param {Object} opponent
 * @param {number} opponent.sequence
 * @param {string} opponent.name
 * @param {string} opponent.avatar
 * @param {boolean} isLocked
 * @returns {HTMLButtonElement}
 */
function createOpponentBadge(opponent, isLocked) {
    const badge = document.createElement('button');
    badge.className = 'opponent-badge';
    badge.type = 'button';

    if (isLocked) {
        badge.classList.add('opponent-badge--locked');
        badge.setAttribute('aria-disabled', 'true');
        badge.disabled = true;
    }

    const avatar = document.createElement('img');
    avatar.className = 'opponent-avatar';
    avatar.alt = opponent.name;
    avatar.src = `${OPPONENTS_AVATAR_PATH}/${opponent.avatar}`;

    const name = document.createElement('span');
    name.className = 'opponent-name';
    name.textContent = opponent.name;

    const sequence = document.createElement('span');
    sequence.className = 'opponent-sequence';
    sequence.textContent = `Уровень ${opponent.sequence}`;

    badge.append(avatar, name, sequence);

    if (isLocked) {
        const lock = document.createElement('span');
        lock.className = 'opponent-lock';
        lock.textContent = 'Недоступно';
        badge.append(lock);
    }

    return badge;
}

/**
 * Загружает список соперников из базы данных SQLite.
 * @returns {Promise<Array<{sequence: number, name: string, avatar: string}>>}
 */
async function loadOpponentsFromDb() {
    const SQL = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });

    const response = await fetch(OPPONENTS_DB_PATH);
    const buffer = await response.arrayBuffer();
    const db = new SQL.Database(new Uint8Array(buffer));

    const result = db.exec('SELECT name, avatar, sequence FROM opponents ORDER BY sequence ASC');
    if (!result.length || !result[0].values.length) {
        return [];
    }

    return result[0].values.map(row => ({
        name: row[0],
        avatar: row[1],
        sequence: Number(row[2])
    }));
}

/**
 * Инициализирует стартовый экран.
 */
async function initStartScreen() {
    const deckBanner = document.getElementById('deckBanner');
    const opponentsGrid = document.getElementById('opponentsGrid');

    if (!deckBanner || !opponentsGrid) {
        return;
    }

    try {
        const [cardCount, maxCoolness, opponents] = await Promise.all([
            window.userCards?.getUserCardCount?.() ?? Promise.resolve(0),
            window.userCards?.getMaxOpponentCoolness?.() ?? Promise.resolve(0),
            loadOpponentsFromDb()
        ]);

        if (cardCount < MIN_DECK_PULSE_THRESHOLD) {
            deckBanner.classList.add('deck-banner--pulse');
        }

        const maxUnlockedSequence = Math.max(1, Number(maxCoolness) + 1);

        opponents.forEach(opponent => {
            const isLocked = opponent.sequence > maxUnlockedSequence;
            const badge = createOpponentBadge(opponent, isLocked);
            opponentsGrid.append(badge);
        });
    } catch (error) {
        console.error('Ошибка загрузки стартового экрана:', error);
        opponentsGrid.innerHTML = '<p class="opponents-error">Не удалось загрузить список соперников.</p>';
    }
}

document.addEventListener('DOMContentLoaded', initStartScreen);
