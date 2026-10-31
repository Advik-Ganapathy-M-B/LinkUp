const CURRENT_USER_ID = 'you';

let attendees = [];
let currentUser = null;
let currentConnections = new Set();
let selectedInterest = 'All';
let profileReturnScroll = { x: 0, y: 0 };
let profileOpenScroll = { x: 0, y: 0 };
let profileReturnCardId = '';
let lastDataSnapshot = '';

const grid = document.querySelector('#attendee-grid');
const searchInput = document.querySelector('#search-input');
const filters = document.querySelector('#filters');
const count = document.querySelector('#attendee-count');
const emptyState = document.querySelector('#empty-state');
const apiError = document.querySelector('#api-error');
const roomMap = document.querySelector('#room-map');
const yourPin = document.querySelector('#your-pin');
const locationStatus = document.querySelector('#location-status');
const clearLocationButton = document.querySelector('#clear-location');
const checkInToggle = document.querySelector('#check-in-toggle');
const profileDialog = document.querySelector('#profile-dialog');
const profileView = document.querySelector('#profile-view');
const profileEditForm = document.querySelector('#profile-edit-form');

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(problem.detail || `Request failed (${response.status})`);
  }
  return response.json();
}

function showApiError(message) {
  apiError.textContent = message;
  apiError.hidden = false;
}

async function loadData() {
  const [loadedAttendees, loadedUser] = await Promise.all([
    apiRequest('/api/attendees'),
    apiRequest('/api/me'),
  ]);
  const snapshot = JSON.stringify([loadedAttendees, loadedUser]);
  const dataChanged = snapshot !== lastDataSnapshot;
  lastDataSnapshot = snapshot;
  attendees = loadedAttendees;
  currentUser = loadedUser;
  currentConnections = new Set(currentUser.connections);
  apiError.hidden = true;
  if (dataChanged) {
    renderFilters();
    renderAttendees();
    renderMapPins();
  }
  updateCheckInUI();
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function initialsFor(name) {
  return name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function safeWebUrl(value, linkedinOnly = false) {
  try {
    const url = new URL(value);
    const isWebAddress = url.protocol === 'https:' || url.protocol === 'http:';
    const isLinkedIn = url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com');
    if (!isWebAddress || (linkedinOnly && !isLinkedIn)) return '';
    return url.href;
  } catch {
    return '';
  }
}

function getMutualConnections(person) {
  return [...currentConnections]
    .filter((connectionId) => connectionId !== person.id && (person.connections || []).includes(connectionId))
    .map((connectionId) => attendees.find((attendee) => attendee.id === connectionId))
    .filter(Boolean);
}

function showPin(x, y) {
  yourPin.style.left = `${x}%`;
  yourPin.style.top = `${y}%`;
  yourPin.hidden = false;
}

function updateCheckInUI() {
  checkInToggle.textContent = currentUser?.checkedIn ? 'Check out' : 'Check in';
  if (!currentUser?.checkedIn) {
    yourPin.hidden = true;
    clearLocationButton.hidden = true;
    locationStatus.textContent = 'Checked out · your pin is hidden';
  } else if (currentUser.location) {
    showPin(currentUser.location.x, currentUser.location.y);
    locationStatus.textContent = 'Your pin is shared with attendees';
    clearLocationButton.hidden = false;
  } else {
    yourPin.hidden = true;
    clearLocationButton.hidden = true;
    locationStatus.textContent = 'Checked in · tap the map to add your spot';
  }
}

function renderMapPins() {
  roomMap.querySelectorAll('.other-map-pin').forEach((pin) => pin.remove());
  for (const person of attendees) {
    if (person.id === CURRENT_USER_ID || !person.checkedIn || !person.location) continue;
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = `other-map-pin avatar ${person.color}`;
    pin.style.left = `${person.location.x}%`;
    pin.style.top = `${person.location.y}%`;
    pin.textContent = initialsFor(person.name);
    pin.title = `${person.name} · view profile`;
    pin.setAttribute('aria-label', `View ${person.name}'s profile`);
    pin.addEventListener('click', (event) => {
      event.stopPropagation();
      openProfile(person, null);
    });
    roomMap.appendChild(pin);
  }
}

async function changeConnection(personId) {
  const pagePosition = { x: window.scrollX, y: window.scrollY };
  const isConnected = currentConnections.has(personId);
  try {
    await apiRequest(`/api/connections/${encodeURIComponent(personId)}`, {
      method: isConnected ? 'DELETE' : 'PUT',
    });
    await loadData();
    requestAnimationFrame(() => {
      window.scrollTo(pagePosition.x, pagePosition.y);
      const updatedButton = [...grid.querySelectorAll('[data-connect-id]')]
        .find((button) => button.dataset.connectId === personId);
      updatedButton?.focus({ preventScroll: true });
    });
  } catch (error) {
    showApiError(`Could not update connection: ${error.message}`);
  }
}

function renderFilters() {
  const topics = [...new Set(attendees.flatMap((person) => person.interests))]
    .filter((topic) => topic !== 'Mutuals');
  const filterOptions = ['All', 'Mutuals', ...topics];
  filters.innerHTML = filterOptions.map((interest) => `
    <button class="filter-button ${interest === selectedInterest ? 'active' : ''}" type="button" data-interest="${escapeHTML(interest)}">
      ${escapeHTML(interest)}
    </button>
  `).join('');
}

function renderAttendees() {
  const query = searchInput.value.trim().toLowerCase();
  let visibleAttendees = attendees.filter((person) => {
    const mutualCount = getMutualConnections(person).length;
    const matchesInterest = person.checkedIn && (selectedInterest === 'All'
      || (selectedInterest === 'Mutuals' ? mutualCount > 0 : person.interests.includes(selectedInterest)));
    const searchableText = `${person.name} ${person.role} ${person.note} ${person.education} ${person.funFact} ${person.lookingToMeet} ${person.interests.join(' ')}`.toLowerCase();
    return matchesInterest && searchableText.includes(query);
  });

  if (selectedInterest === 'Mutuals') {
    visibleAttendees.sort((first, second) => getMutualConnections(second).length - getMutualConnections(first).length);
  }

  count.textContent = visibleAttendees.length;
  emptyState.hidden = visibleAttendees.length > 0;
  emptyState.textContent = selectedInterest === 'Mutuals'
    ? 'No mutual connections yet. Connect to someone to find people you have in common.'
    : 'No one matches that search yet. Try another interest or name.';
  grid.innerHTML = visibleAttendees.map((person) => `
    <article class="person-card">
      <div class="person-card-main" data-person-id="${escapeHTML(person.id)}" tabindex="0" role="button" aria-haspopup="dialog" aria-label="View ${escapeHTML(person.name)}'s profile">
        <div class="person-top">
          <div class="avatar ${escapeHTML(person.color)}" aria-hidden="true">${escapeHTML(initialsFor(person.name))}</div>
          <div><h3 class="person-name">${escapeHTML(person.name)}</h3><p class="person-role">${escapeHTML(person.role)}</p></div>
        </div>
        <p class="person-note">${escapeHTML(person.note)}</p>
        <div class="tag-row">${person.interests.map((interest) => `<span class="tag">${escapeHTML(interest)}</span>`).join('')}</div>
        <span class="card-hint">View profile →</span>
      </div>
      <div class="card-actions">
        ${person.id === CURRENT_USER_ID
          ? '<span class="my-profile-label">Your profile</span>'
          : `<span class="mutual-count">${getMutualConnections(person).length} mutual connection${getMutualConnections(person).length === 1 ? '' : 's'}</span>
             <button class="connect-button ${currentConnections.has(person.id) ? 'connected' : ''}" type="button" data-connect-id="${escapeHTML(person.id)}" aria-pressed="${currentConnections.has(person.id)}">${currentConnections.has(person.id) ? '✓ Connected' : 'Connect'}</button>`}
      </div>
    </article>
  `).join('');
}

function renderProfile(person) {
  const photoUrl = safeWebUrl(person.photo);
  const linkedinUrl = safeWebUrl(person.linkedin, true);
  const portrait = photoUrl
    ? `<img class="profile-photo" src="${escapeHTML(photoUrl)}" alt="${escapeHTML(person.name)}" />`
    : `<div class="avatar ${escapeHTML(person.color)} profile-avatar" aria-hidden="true">${escapeHTML(initialsFor(person.name))}</div>`;
  const profileField = (label, value) => `
    <section class="profile-fact"><h3>${label}</h3><p>${value ? escapeHTML(value) : 'Not shared yet'}</p></section>
  `;
  const mutualConnections = getMutualConnections(person);

  profileView.innerHTML = `
    <div class="profile-heading">
      ${portrait}
      <div><h2>${escapeHTML(person.name)}</h2><p>${escapeHTML(person.role)}</p></div>
    </div>
    <div class="profile-facts">
      ${profileField('About', person.note)}
      ${profileField('Education or background', person.education)}
      ${profileField('Fun fact', person.funFact)}
      ${profileField('Hoping to meet', person.lookingToMeet)}
      <section class="profile-fact"><h3>Interests</h3><div class="tag-row">${person.interests.map((interest) => `<span class="tag">${escapeHTML(interest)}</span>`).join('')}</div></section>
      ${person.id === CURRENT_USER_ID ? '' : profileField('Common connections', mutualConnections.map((mutual) => mutual.name).join(', ') || 'No shared connections yet')}
      ${linkedinUrl ? `<a class="profile-link" href="${escapeHTML(linkedinUrl)}" target="_blank" rel="noopener noreferrer">View LinkedIn profile ↗</a>` : ''}
    </div>
    ${person.id === CURRENT_USER_ID ? '<button id="edit-own-profile" class="primary-button" type="button">Edit my profile</button>' : ''}
  `;

  const photo = profileView.querySelector('.profile-photo');
  if (photo) {
    photo.addEventListener('error', () => {
      const fallbackAvatar = document.createElement('div');
      fallbackAvatar.className = `avatar ${person.color} profile-avatar`;
      fallbackAvatar.textContent = initialsFor(person.name);
      fallbackAvatar.setAttribute('aria-hidden', 'true');
      photo.replaceWith(fallbackAvatar);
    });
  }
}

function openProfile(person, card) {
  profileReturnScroll = { x: window.scrollX, y: window.scrollY };
  profileReturnCardId = person.id;
  if (card) card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  profileOpenScroll = { x: window.scrollX, y: window.scrollY };
  renderProfile(person);
  profileEditForm.hidden = true;
  profileView.hidden = false;
  profileDialog.showModal();
  requestAnimationFrame(() => window.scrollTo(profileOpenScroll.x, profileOpenScroll.y));
}

function startProfileEdit() {
  for (const field of profileEditForm.elements) {
    if (field.name && currentUser[field.name] !== undefined) field.value = currentUser[field.name];
  }
  profileView.hidden = true;
  profileEditForm.hidden = false;
}

checkInToggle.addEventListener('click', async () => {
  const endpoint = currentUser?.checkedIn ? '/api/check-out' : '/api/check-in';
  try {
    await apiRequest(endpoint, { method: 'POST' });
    await loadData();
  } catch (error) {
    showApiError(`Could not update check-in: ${error.message}`);
  }
});

roomMap.addEventListener('click', async (event) => {
  if (event.target.closest('.other-map-pin, #your-pin')) return;
  if (!currentUser?.checkedIn) {
    locationStatus.textContent = 'Check in before placing your pin';
    return;
  }
  const bounds = roomMap.getBoundingClientRect();
  const x = Math.min(96, Math.max(4, ((event.clientX - bounds.left) / bounds.width) * 100));
  const y = Math.min(91, Math.max(22, ((event.clientY - bounds.top) / bounds.height) * 100));
  try {
    await apiRequest('/api/location', { method: 'PUT', body: JSON.stringify({ x, y }) });
    await loadData();
  } catch (error) {
    showApiError(`Could not save your location: ${error.message}`);
  }
});

clearLocationButton.addEventListener('click', async () => {
  try {
    await apiRequest('/api/location', { method: 'DELETE' });
    await loadData();
  } catch (error) {
    showApiError(`Could not clear your location: ${error.message}`);
  }
});

grid.addEventListener('click', (event) => {
  const connectButton = event.target.closest('[data-connect-id]');
  if (connectButton) {
    changeConnection(connectButton.dataset.connectId);
    return;
  }
  const card = event.target.closest('[data-person-id]');
  if (!card) return;
  const person = attendees.find((attendee) => attendee.id === card.dataset.personId);
  if (person) openProfile(person, card);
});

grid.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('[data-person-id]');
  if (!card) return;
  event.preventDefault();
  const person = attendees.find((attendee) => attendee.id === card.dataset.personId);
  if (person) openProfile(person, card);
});

profileView.addEventListener('click', (event) => {
  if (event.target.closest('#edit-own-profile')) startProfileEdit();
});

profileEditForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profileChanges = Object.fromEntries(new FormData(profileEditForm).entries());
  try {
    currentUser = await apiRequest('/api/me', { method: 'PUT', body: JSON.stringify(profileChanges) });
    await loadData();
    renderProfile(currentUser);
    profileEditForm.hidden = true;
    profileView.hidden = false;
  } catch (error) {
    showApiError(`Could not save your profile: ${error.message}`);
  }
});

document.querySelector('#cancel-profile-edit').addEventListener('click', () => {
  profileEditForm.hidden = true;
  profileView.hidden = false;
});

document.querySelector('#close-profile-dialog').addEventListener('click', () => profileDialog.close());
profileDialog.addEventListener('close', () => {
  requestAnimationFrame(() => {
    const returnCard = [...grid.querySelectorAll('[data-person-id]')]
      .find((card) => card.dataset.personId === profileReturnCardId);
    if (returnCard) returnCard.focus({ preventScroll: true });
    requestAnimationFrame(() => window.scrollTo(profileReturnScroll.x, profileReturnScroll.y));
  });
});

filters.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-interest]');
  if (!button) return;
  selectedInterest = button.dataset.interest;
  renderFilters();
  renderAttendees();
});

searchInput.addEventListener('input', renderAttendees);

loadData().catch((error) => {
  showApiError(`LinkUp could not reach its backend. Start the server, then refresh. Details: ${error.message}`);
});

// Check for updates from other browsers every five seconds while the profile dialog is closed.
window.setInterval(() => {
  if (!profileDialog.open) {
    loadData().catch((error) => showApiError(`Could not refresh event data: ${error.message}`));
  }
}, 5000);
