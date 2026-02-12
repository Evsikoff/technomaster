/**
 * Collector Screen Controller for Technomaster
 * Экран «Уровень коллекционера» — визуализация прогресса сбора коллекции
 */

const COLLECTOR_DB_PATH = 'public/data/cards.db';
const INVENTORY_CAPACITY = 100;

/**
 * Система званий по очкам коллекционера
 */
const RANK_TIERS = [
    { min: 0, title: 'Новичок' },
    { min: 300, title: 'Любитель' },
    { min: 600, title: 'Инженер' },
    { min: 900, title: 'Эксперт' },
    { min: 1200, title: 'Профессор' },
    { min: 1500, title: 'Техно Мастер' }
];

/**
 * Определение звания по очкам
 * @param {number} score
 * @returns {{title: string, min: number, nextMin: number|null}}
 */
function getRankInfo(score) {
    let current = RANK_TIERS[0];
    let nextMin = RANK_TIERS.length > 1 ? RANK_TIERS[1].min : null;

    for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
        if (score >= RANK_TIERS[i].min) {
            current = RANK_TIERS[i];
            nextMin = (i + 1 < RANK_TIERS.length) ? RANK_TIERS[i + 1].min : null;
            break;
        }
    }

    return {
        title: current.title,
        min: current.min,
        nextMin: nextMin
    };
}

/**
 * Состояние экрана
 */
const collectorState = {
    db: null,
    userData: null,
    cardTypesMap: new Map(),
    cardGroups: [],
    activeTooltip: null
};

/**
 * Инициализация базы данных
 * @returns {Promise<object>}
 */
async function initCollectorDatabase() {
    const SQL = await SqlLoader.init();

    const response = await fetch(COLLECTOR_DB_PATH);
    const buffer = await response.arrayBuffer();
    return new SQL.Database(new Uint8Array(buffer));
}

/**
 * Загрузка типов карт из БД
 * @param {object} db
 * @returns {Map<number, object>}
 */
function loadCollectorCardTypes(db) {
    const map = new Map();

    try {
        const result = db.exec(
            'SELECT ct.id, ct.name, ct.group_id FROM card_types ct ORDER BY ct.group_id ASC, ct.id ASC'
        );

        if (result.length > 0) {
            result[0].values.forEach(row => {
                map.set(row[0], {
                    id: row[0],
                    name: row[1],
                    groupId: row[2]
                });
            });
        }
    } catch (error) {
        console.error('CollectorScreen: Ошибка загрузки типов карт:', error);
    }

    return map;
}

/**
 * Загрузка групп карт из БД
 * @param {object} db
 * @returns {Array<{id:number, name:string, sequence:number}>}
 */
function loadCollectorCardGroups(db) {
    try {
        const result = db.exec('SELECT id, name, sequence FROM card_groups ORDER BY sequence ASC, id ASC');
        if (!result.length) return [];

        return result[0].values.map(row => ({
            id: row[0],
            name: row[1],
            sequence: row[2]
        }));
    } catch (error) {
        console.error('CollectorScreen: Ошибка загрузки групп карт:', error);
        return [];
    }
}

/**
 * Получение карт игрока из userData
 * @param {object} userData
 * @returns {Array}
 */
function getCollectorPlayerCards(userData) {
    if (!userData || !Array.isArray(userData.cards) || !Array.isArray(userData.cardholders)) {
        return [];
    }

    const playerCardholder = userData.cardholders.find(ch => ch.player === true);
    if (!playerCardholder) return [];

    return userData.cards.filter(card => card.cardholder_id === playerCardholder.id);
}

/**
 * Подсчёт количества карт каждого типа в инвентаре
 * @param {Array} playerCards
 * @returns {{ownedCounts: Object, totalCards: number, uniqueTypes: number}}
 */
function aggregateOwnedCards(playerCards) {
    const ownedCounts = {};
    let totalCards = 0;

    playerCards.forEach(card => {
        const typeId = card.cardTypeId;
        ownedCounts[typeId] = (ownedCounts[typeId] || 0) + 1;
        totalCards++;
    });

    const uniqueTypes = Object.keys(ownedCounts).length;

    return { ownedCounts, totalCards, uniqueTypes };
}

/**
 * Скрытие текущего тултипа
 */
function hideActiveTooltip() {
    if (collectorState.activeTooltip) {
        collectorState.activeTooltip.remove();
        collectorState.activeTooltip = null;
    }
}

/**
 * Показ тултипа над кружком
 * @param {HTMLElement} circleEl
 * @param {string} text
 */
function showTooltip(circleEl, text) {
    hideActiveTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'collector-tooltip';
    tooltip.textContent = text;

    document.body.appendChild(tooltip);
    collectorState.activeTooltip = tooltip;

    const rect = circleEl.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.top - tooltipRect.height - 8;

    // Если не влезает сверху — показываем снизу
    if (top < 4) {
        top = rect.bottom + 8;
    }

    // Не вылезаем за экран по горизонтали
    if (left < 4) left = 4;
    if (left + tooltipRect.width > window.innerWidth - 4) {
        left = window.innerWidth - tooltipRect.width - 4;
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}

/**
 * Создание индикатора карты (кружка)
 * @param {object} cardType
 * @param {number|undefined} count
 * @returns {HTMLElement}
 */
function createCircle(cardType, count) {
    const isOwned = count && count > 0;
    const circle = document.createElement('div');
    circle.className = isOwned ? 'collector-circle collector-circle--owned' : 'collector-circle collector-circle--empty';

    if (isOwned) {
        circle.textContent = count;

        circle.addEventListener('mouseenter', () => {
            showTooltip(circle, cardType.name);
        });

        circle.addEventListener('mouseleave', () => {
            hideActiveTooltip();
        });

        // Для тач-устройств
        circle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            showTooltip(circle, cardType.name);
        });
    }

    return circle;
}

/**
 * Рендер секции группы карт
 * @param {object} group
 * @param {Map} cardTypesMap
 * @param {Object} ownedCounts
 * @returns {HTMLElement}
 */
function renderCollectorGroupSection(group, cardTypesMap, ownedCounts) {
    // Фильтруем типы, принадлежащие этой группе
    const groupTypes = [];
    cardTypesMap.forEach(ct => {
        if (ct.groupId === group.id) {
            groupTypes.push(ct);
        }
    });

    // Сортируем по id
    groupTypes.sort((a, b) => a.id - b.id);

    // Считаем собранные в этой группе
    let ownedInGroup = 0;
    groupTypes.forEach(ct => {
        if (ownedCounts[ct.id] && ownedCounts[ct.id] > 0) {
            ownedInGroup++;
        }
    });

    const section = document.createElement('div');
    section.className = 'collector-group-section';

    const header = document.createElement('h3');
    header.className = 'collector-group-title';
    header.textContent = `${group.name} (${ownedInGroup} / ${groupTypes.length})`;
    section.appendChild(header);

    const container = document.createElement('div');
    container.className = 'collector-circles-container';

    groupTypes.forEach(ct => {
        const circle = createCircle(ct, ownedCounts[ct.id]);
        container.appendChild(circle);
    });

    section.appendChild(container);

    return section;
}

/**
 * Основная функция рендеринга экрана коллекционера
 * @param {object} userData
 */
function renderCollectorScreen(userData) {
    const body = document.getElementById('collectorBody');
    const rankTitleEl = document.getElementById('collectorRankTitle');
    const rankScoreEl = document.getElementById('collectorRankScore');
    const progressFill = document.getElementById('collectorProgressFill');
    const progressLabel = document.getElementById('collectorProgressLabel');

    if (!body) return;

    const playerCards = getCollectorPlayerCards(userData);
    const { ownedCounts, totalCards, uniqueTypes } = aggregateOwnedCards(playerCards);

    // Расчёт очков
    const score = (uniqueTypes * 10) + totalCards;
    const totalTypes = collectorState.cardTypesMap.size;
    const maxScore = (totalTypes * 10) + INVENTORY_CAPACITY;

    // Ранг
    const rankInfo = getRankInfo(score);
    rankTitleEl.textContent = rankInfo.title;
    rankScoreEl.textContent = `Очки: ${score}`;

    // Прогресс-бар
    if (rankInfo.nextMin !== null) {
        const rangeSize = rankInfo.nextMin - rankInfo.min;
        const progress = score - rankInfo.min;
        const pct = Math.min(100, Math.round((progress / rangeSize) * 100));
        progressFill.style.width = pct + '%';
        progressLabel.textContent = `${score} / ${rankInfo.nextMin} до звания «${RANK_TIERS[RANK_TIERS.indexOf(RANK_TIERS.find(r => r.min === rankInfo.nextMin))].title}»`;
    } else {
        // Максимальный ранг
        progressFill.style.width = '100%';
        progressLabel.textContent = `Максимальное звание достигнуто! (${score} / ${maxScore})`;
    }

    // Сетка коллекции
    body.innerHTML = '';

    collectorState.cardGroups.forEach(group => {
        const section = renderCollectorGroupSection(group, collectorState.cardTypesMap, ownedCounts);
        body.appendChild(section);
    });
}

/**
 * Привязка обработчиков
 */
function setupCollectorEventHandlers() {
    const backBtn = document.getElementById('collectorBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'deck.html';
        });
    }

    // Скрытие тултипа при клике вне
    document.addEventListener('click', (e) => {
        if (collectorState.activeTooltip && !e.target.closest('.collector-circle--owned')) {
            hideActiveTooltip();
        }
    });
}

/**
 * Инициализация экрана
 */
async function initCollectorScreen() {
    try {
        console.log('CollectorScreen: Начинаю инициализацию...');

        if (window.userCards?.whenReady) {
            await window.userCards.whenReady();
        }

        const db = await initCollectorDatabase();
        collectorState.db = db;

        collectorState.cardTypesMap = loadCollectorCardTypes(db);
        collectorState.cardGroups = loadCollectorCardGroups(db);

        const userData = await window.userCards.getUserData();
        collectorState.userData = userData;

        renderCollectorScreen(userData);
        setupCollectorEventHandlers();

        console.log('CollectorScreen: Инициализация завершена.');
    } catch (error) {
        console.error('CollectorScreen: Ошибка инициализации:', error);
        const body = document.getElementById('collectorBody');
        if (body) {
            body.innerHTML = '<p class="error">Не удалось загрузить данные коллекции.</p>';
        }
    }
}

document.addEventListener('DOMContentLoaded', initCollectorScreen);
