function getPartyPayload() {
    const payloadKey = window.partyOrchestrator?.keys?.payload || 'technomaster.party.payload';
    const raw = sessionStorage.getItem(payloadKey);

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        console.error('PartyScreen: не удалось разобрать данные партии', error);
        return null;
    }
}

function renderHand(container, cards) {
    if (!container) {
        return;
    }

    container.innerHTML = '';

    if (!cards || cards.length === 0) {
        container.innerHTML = '<p>Нет карт.</p>';
        return;
    }

    cards.forEach(card => {
        const badge = document.createElement('div');
        badge.className = 'opponent-badge';

        const title = document.createElement('span');
        title.className = 'opponent-name';
        title.textContent = `#${card.id}`;

        const info = document.createElement('span');
        info.className = 'opponent-sequence';
        info.textContent = `Тип: ${card.cardTypeId} | Ур.: ${card.cardLevel}`;

        badge.append(title, info);
        container.appendChild(badge);
    });
}

function initPartyScreen() {
    const payload = getPartyPayload();
    const opponentEl = document.getElementById('partyOpponent');
    const playerHandEl = document.getElementById('playerHand');
    const opponentHandEl = document.getElementById('opponentHand');

    if (!payload) {
        if (opponentEl) {
            opponentEl.textContent = 'Данные партии не найдены.';
        }
        return;
    }

    if (opponentEl) {
        opponentEl.textContent = `Оппонент #${payload.opponentId}`;
    }

    renderHand(playerHandEl, payload.playerHand);
    renderHand(opponentHandEl, payload.opponentHand);
}

document.addEventListener('DOMContentLoaded', initPartyScreen);
