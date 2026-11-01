import { createClient } from '@supabase/supabase-js';
import { buildConversationStarters } from './conversation-starters.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;

let attendees = [];
let currentUser = null;
let currentConnections = new Set();
let incomingRequests = new Set();
let outgoingRequests = new Set();
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
const authDialog = document.querySelector('#auth-dialog');
const authForm = document.querySelector('#auth-form');
const authMessage = document.querySelector('#auth-message');
const authOpenButton = document.querySelector('#auth-open');
const authModeToggle = document.querySelector('#auth-mode-toggle');
const authTitle = document.querySelector('#auth-title');
const authSubmit = document.querySelector('#auth-submit');
const signOutButton = document.querySelector('#sign-out');
const accountName = document.querySelector('#account-name');
const confirmPasswordLabel = document.querySelector('#confirm-password-label');
const confirmPasswordInput = document.querySelector('#confirm-password');
const requestsSection = document.querySelector('#requests-section');
const incomingRequestList = document.querySelector('#incoming-request-list');
let authMode = 'signin';
let activeDataLoad = null;

async function apiRequest(path, options = {}) {
  const { data: { session } = {} } = supabase ? await supabase.auth.getSession() : {};
  if (!session?.access_token) throw new Error('Sign in to continue.');
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
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

function updateAccountControls(session) {
  authOpenButton.hidden = Boolean(session);
  signOutButton.hidden = !session;
  accountName.hidden = !session;
  accountName.textContent = session?.user?.email || '';
}

function showAuthDialog() {
  if (!authDialog.open) authDialog.showModal();
}

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === 'signup';
  authTitle.textContent = signingUp ? 'Create your account' : 'Sign in to LinkUp';
  authSubmit.textContent = signingUp ? 'Create account' : 'Sign in';
  authModeToggle.textContent = signingUp
    ? 'Already have an account? Sign in'
    : 'New here? Create an account';
  confirmPasswordLabel.hidden = !signingUp;
  confirmPasswordInput.required = signingUp;
  confirmPasswordInput.value = '';
  document.querySelector('#auth-description').textContent = signingUp
    ? 'Create a profile to meet people at this event.'
    : "Use your email and password to see who's here.";
  document.querySelector('#auth-password').autocomplete = signingUp ? 'new-password' : 'current-password';
  authMessage.textContent = '';
}

function loadData() {
  if (activeDataLoad) return activeDataLoad;
  activeDataLoad = apiRequest('/api/bootstrap').then(({ attendees: loadedAttendees, me: loadedUser, requests }) => {
    const snapshot = JSON.stringify([loadedAttendees, loadedUser, requests]);
    const dataChanged = snapshot !== lastDataSnapshot;
    lastDataSnapshot = snapshot;
    attendees = loadedAttendees;
    currentUser = loadedUser;
    currentConnections = new Set(currentUser.connections);
    incomingRequests = new Set(requests.incoming);
    outgoingRequests = new Set(requests.outgoing);
    apiError.hidden = true;
    if (dataChanged) {
      renderFilters();
      renderAttendees();
      renderConnectionRequests();
      renderMapPins();
    }
    updateCheckInUI();
  }).finally(() => {
    activeDataLoad = null;
  });
  return activeDataLoad;
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
    if (person.id === currentUser?.id || !person.checkedIn || !person.location) continue;
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

async function changeConnection(personId, action = 'request') {
  const pagePosition = { x: window.scrollX, y: window.scrollY };
  try {
    const encodedId = encodeURIComponent(personId);
    const isDisconnect = action === 'disconnect';
    await apiRequest(isDisconnect
      ? `/api/connections/${encodedId}`
      : `/api/connection-requests/${encodedId}`, {
      method: isDisconnect ? 'DELETE' : 'POST',
    });
    await loadData();
    requestAnimationFrame(() => {
      window.scrollTo(pagePosition.x, pagePosition.y);
      const updatedButton = [...grid.querySelectorAll('[data-connect-id], [data-disconnect-id]')]
        .find((button) => button.dataset.connectId === personId || button.dataset.disconnectId === personId);
      updatedButton?.focus({ preventScroll: true });
    });
  } catch (error) {
    showApiError(`Could not update connection request: ${error.message}`);
  }
}

async function respondToConnectionRequest(personId, accept) {
  try {
    const encodedId = encodeURIComponent(personId);
    await apiRequest(accept
      ? `/api/connection-requests/${encodedId}/accept`
      : `/api/connection-requests/${encodedId}`, {
      method: accept ? 'POST' : 'DELETE',
    });
    await loadData();
  } catch (error) {
    showApiError(`Could not respond to request: ${error.message}`);
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

function renderConnectionRequests() {
  const requests = [...incomingRequests]
    .map((personId) => attendees.find((person) => person.id === personId))
    .filter(Boolean);
  requestsSection.hidden = requests.length === 0;
  incomingRequestList.innerHTML = requests.map((person) => `
    <article class="request-card">
      <div class="request-person">
        <div class="avatar ${escapeHTML(person.color)}" aria-hidden="true">${escapeHTML(initialsFor(person.name))}</div>
        <div><strong>${escapeHTML(person.name)}</strong><span>${escapeHTML(person.role)} sent you a request</span></div>
      </div>
      <div class="request-actions">
        <button class="primary-button" type="button" data-accept-request-id="${escapeHTML(person.id)}">Accept</button>
        <button class="secondary-button" type="button" data-decline-request-id="${escapeHTML(person.id)}">Decline</button>
      </div>
    </article>
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
    ? 'No mutual connections yet. Send or accept a request to connect with someone.'
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
        ${person.id === currentUser?.id
          ? '<span class="my-profile-label">Your profile</span>'
          : `<span class="mutual-count">${getMutualConnections(person).length} mutual connection${getMutualConnections(person).length === 1 ? '' : 's'}</span>
             <button class="connect-button ${currentConnections.has(person.id) ? 'connected' : ''}" type="button" data-connect-id="${escapeHTML(person.id)}" aria-pressed="${currentConnections.has(person.id)}">${currentConnections.has(person.id) ? '✓ Connected' : 'Connect'}</button>`}
      </div>
    </article>
  `).join('');

  for (const button of grid.querySelectorAll('[data-connect-id]')) {
    const personId = button.dataset.connectId;
    const person = attendees.find((attendee) => attendee.id === personId);
    if (!person?.canReceiveRequests) {
      button.textContent = 'Sample profile';
      button.disabled = true;
      delete button.dataset.connectId;
    } else if (currentConnections.has(personId)) {
      button.textContent = 'Connected';
      button.classList.add('connected');
      button.dataset.disconnectId = personId;
      delete button.dataset.connectId;
    } else if (incomingRequests.has(personId)) {
      button.textContent = 'Request received';
      button.disabled = true;
      delete button.dataset.connectId;
    } else if (outgoingRequests.has(personId)) {
      button.textContent = 'Request sent · cancel';
      button.dataset.cancelRequestId = personId;
      button.classList.add('request-pending');
      delete button.dataset.connectId;
    }
  }
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
  const conversationStarters = person.id === currentUser?.id
    ? []
    : buildConversationStarters(currentUser, person);
  const conversationStartersSection = person.id === currentUser?.id ? '' : `
    <section class="conversation-starters" aria-labelledby="conversation-starters-title">
      <div class="conversation-starters-header">
        <h3 id="conversation-starters-title">Conversation starters</h3>
        <span>Based on shared profile details</span>
      </div>
      ${conversationStarters.length ? `
        <ol class="starter-list">
          ${conversationStarters.map((starter) => `
            <li class="starter-card">
              <p class="starter-prompt">“${escapeHTML(starter.prompt)}”</p>
              <p class="starter-reason"><strong>Why it fits:</strong> ${escapeHTML(starter.reason)}</p>
            </li>
          `).join('')}
        </ol>
      ` : '<p class="starter-empty">There is not enough shared profile detail yet. Ask what brought them to this event.</p>'}
    </section>
  `;

  profileView.innerHTML = `
    <div class="profile-heading">
      ${portrait}
      <div><h2>${escapeHTML(person.name)}</h2><p>${escapeHTML(person.role)}</p></div>
    </div>
    <div class="profile-facts">
      ${conversationStartersSection}
      ${profileField('About', person.note)}
      ${profileField('Education or background', person.education)}
      ${profileField('Fun fact', person.funFact)}
      ${profileField('Hoping to meet', person.lookingToMeet)}
      <section class="profile-fact"><h3>Interests</h3><div class="tag-row">${person.interests.map((interest) => `<span class="tag">${escapeHTML(interest)}</span>`).join('')}</div></section>
      ${person.id === currentUser?.id ? '' : profileField('Common connections', mutualConnections.map((mutual) => mutual.name).join(', ') || 'No shared connections yet')}
      ${linkedinUrl ? `<a class="profile-link" href="${escapeHTML(linkedinUrl)}" target="_blank" rel="noopener noreferrer">View LinkedIn profile ↗</a>` : ''}
    </div>
    ${person.id === currentUser?.id ? '<button id="edit-own-profile" class="primary-button" type="button">Edit my profile</button>' : ''}
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
  const disconnectButton = event.target.closest('[data-disconnect-id]');
  if (disconnectButton) {
    changeConnection(disconnectButton.dataset.disconnectId, 'disconnect');
    return;
  }
  const cancelButton = event.target.closest('[data-cancel-request-id]');
  if (cancelButton) {
    respondToConnectionRequest(cancelButton.dataset.cancelRequestId, false);
    return;
  }
  const card = event.target.closest('[data-person-id]');
  if (!card) return;
  const person = attendees.find((attendee) => attendee.id === card.dataset.personId);
  if (person) openProfile(person, card);
});

incomingRequestList.addEventListener('click', (event) => {
  const acceptButton = event.target.closest('[data-accept-request-id]');
  if (acceptButton) {
    respondToConnectionRequest(acceptButton.dataset.acceptRequestId, true);
    return;
  }
  const declineButton = event.target.closest('[data-decline-request-id]');
  if (declineButton) respondToConnectionRequest(declineButton.dataset.declineRequestId, false);
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

authOpenButton.addEventListener('click', () => {
  setAuthMode('signin');
  showAuthDialog();
});

document.querySelector('#close-auth-dialog').addEventListener('click', () => authDialog.close());
authModeToggle.addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.querySelector('#auth-email').value.trim();
  const passwordInput = document.querySelector('#auth-password');
  const password = passwordInput.value;
  authSubmit.disabled = true;
  authMessage.textContent = authMode === 'signup' ? 'Creating account…' : 'Signing in…';
  try {
    if (authMode === 'signup' && password !== confirmPasswordInput.value) {
      authMessage.textContent = 'Those passwords do not match. Please try again.';
      return;
    }
    if (!supabase) throw new Error('Add your Supabase URL and publishable key to .env, then restart Vite.');
    const result = authMode === 'signup'
      ? await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    passwordInput.value = '';
    confirmPasswordInput.value = '';
    if (authMode === 'signup' && !result.data.session) {
      authMessage.textContent = 'Check your email to confirm your account, then come back here to sign in.';
      return;
    }
    authMessage.textContent = 'Signed in. Loading the event…';
    authDialog.close();
    await loadData();
  } catch (error) {
    authMessage.textContent = error.message || 'Could not authenticate. Please try again.';
  } finally {
    authSubmit.disabled = false;
  }
});

signOutButton.addEventListener('click', async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) showApiError(`Could not sign out: ${error.message}`);
});

if (!supabase) {
  updateAccountControls(null);
  showApiError('Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env to enable sign in.');
  setAuthMode('signin');
  showAuthDialog();
} else {
  supabase.auth.onAuthStateChange((_event, session) => {
    updateAccountControls(session);
    if (session) {
      window.setTimeout(() => loadData().catch((error) => showApiError(`Could not load event data: ${error.message}`)), 0);
    } else {
      attendees = [];
      currentUser = null;
      currentConnections = new Set();
      incomingRequests = new Set();
      outgoingRequests = new Set();
      lastDataSnapshot = '';
      renderFilters();
      renderAttendees();
      renderConnectionRequests();
      renderMapPins();
      updateCheckInUI();
      showAuthDialog();
    }
  });
  supabase.auth.getSession().then(({ data: { session } }) => {
    updateAccountControls(session);
    if (session) {
      loadData().catch((error) => showApiError(`LinkUp could not reach its backend. Details: ${error.message}`));
    } else {
      setAuthMode('signin');
      showAuthDialog();
    }
  });
}

// Refresh periodically, but avoid overlapping requests and background-tab traffic.
window.setInterval(() => {
  if (supabase && currentUser && document.visibilityState === 'visible' && !profileDialog.open) {
    loadData().catch((error) => showApiError(`Could not refresh event data: ${error.message}`));
  }
}, 5000);
