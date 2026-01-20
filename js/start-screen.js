const OPPONENTS_DB_PATH = 'public/data/cards.db';
const OPPONENTS_AVATAR_PATH = 'public/img/opponents';
const MIN_DECK_PULSE_THRESHOLD = 5;

/**
 * Создает DOM-элемент бейджа соперника.
 * @param {Object} opponent
 * @param {number} opponent.id
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
    badge.dataset.opponentId = opponent.id;

    if (isLocked) {
        badge.classList.add('opponent-badge--locked');
        badge.setAttribute('aria-disabled', 'true');
        badge.disabled = true;
    } else {
        // Добавляем обработчик клика для перехода на экран настройки руки
        badge.addEventListener('click', () => {
            window.location.href = `hand-setup.html?opponentId=${opponent.id}`;
        });
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
 * @returns {Promise<Array<{id: number, sequence: number, name: string, avatar: string}>>}
 */
async function loadOpponentsFromDb() {
    const SQL = await initSqlJs({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });

    const response = await fetch(OPPONENTS_DB_PATH);
    const buffer = await response.arrayBuffer();
    const db = new SQL.Database(new Uint8Array(buffer));

    const result = db.exec('SELECT id, name, avatar, sequence FROM opponents ORDER BY sequence ASC');
    if (!result.length || !result[0].values.length) {
        return [];
    }

    return result[0].values.map(row => ({
        id: Number(row[0]),
        name: row[1],
        avatar: row[2],
        sequence: Number(row[3])
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
        console.log('StartScreen: Start initializing...');
        console.log('StartScreen: Checking window.userCards:', window.userCards);

        // Ждём завершения инициализации контроллера хранилища
        if (window.userCards?.whenReady) {
            console.log('StartScreen: Ожидаю завершения инициализации контроллера хранилища...');
            await window.userCards.whenReady();
            console.log('StartScreen: Контроллер хранилища инициализирован.');
        }

        let [cardCount, maxCoolness] = await Promise.all([
            window.userCards?.getUserCardCount?.() ?? Promise.resolve(0),
            window.userCards?.getMaxOpponentCoolness?.() ?? Promise.resolve(0)
        ]);

        console.log(`StartScreen: Card count determined as: ${cardCount}`);
        console.log(`StartScreen: Max opponent coolness determined as: ${maxCoolness}`);
        console.log(`StartScreen: window.cardRenderer is available: ${!!window.cardRenderer}`);

        // Если карт 0, генерируем стартовую колоду
        if (cardCount === 0 && window.cardRenderer) {
            console.log('StartScreen: Карт 0. Запуск генерации стартовой колоды...');
            try {
                await window.cardRenderer.init();
                const rules = window.cardRenderer.getStarterDeckRules();

                if (rules) {
                    // Генерируем колоду
                    const deck = window.cardRenderer.generateDeck(rules);
                    console.log(`StartScreen: Сгенерировано ${deck.length} карт.`);

                    // Сохраняем (Yandex Cloud + Browser)
                    if (window.userCards.saveUserDeck) {
                        await window.userCards.saveUserDeck(deck);

                        // Обновляем счетчик
                        cardCount = deck.length;
                        console.log(`StartScreen: Счетчик карт обновлен до ${cardCount}`);
                    }
                }
            } catch (genError) {
                console.error('StartScreen: Ошибка при генерации стартовой колоды:', genError);
            }
        }

        const opponents = await loadOpponentsFromDb();

        const hasLowCardCount = cardCount < MIN_DECK_PULSE_THRESHOLD;
        if (hasLowCardCount) {
            deckBanner.classList.add('deck-banner--pulse');
        } else {
            deckBanner.classList.remove('deck-banner--pulse');
        }

        const maxUnlockedSequence = Math.max(1, Number(maxCoolness) + 1);

        opponents.forEach(opponent => {
            const isLocked = hasLowCardCount || opponent.sequence > maxUnlockedSequence;
            const badge = createOpponentBadge(opponent, isLocked);
            opponentsGrid.append(badge);
        });
    } catch (error) {
        console.error('Ошибка загрузки стартового экрана:', error);
        opponentsGrid.innerHTML = '<p class="opponents-error">Не удалось загрузить список соперников.</p>';
    }
}

document.addEventListener('DOMContentLoaded', initStartScreen);
