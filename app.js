// Sample profiles. The attendee with id "you" is the signed-in demo user.
const attendees = [
  {
    id: 'maya', name: 'Maya Chen', role: 'UX designer · 2nd year',
    note: 'Always up for swapping ideas about making things easier to use.',
    interests: ['Design', 'Startups'], connections: ['arjun', 'nina', 'leo'], color: 'peach', education: 'Human-centred design, 2nd year',
    funFact: 'I can fold a fitted sheet neatly on the first try.',
    lookingToMeet: 'People building thoughtful products and accessible experiences.', linkedin: '', photo: '',
  },
  {
    id: 'arjun', name: 'Arjun Rao', role: 'CS student · 3rd year',
    note: 'Building a tiny app to help people find pickup games on campus.',
    interests: ['Coding', 'Startups'], connections: ['maya', 'dev'], color: 'blue', education: 'Computer science, 3rd year',
    funFact: 'I once built a PC from parts I found in a campus swap group.',
    lookingToMeet: 'People who enjoy turning small ideas into useful apps.', linkedin: '', photo: '',
  },
  {
    id: 'zara', name: 'Zara Patel', role: 'Film society · 2nd year',
    note: 'Looking for people to make a short film with this semester.',
    interests: ['Film', 'Creative'], connections: ['nina'], color: 'lilac', education: 'Media studies, 2nd year',
    funFact: 'I keep a list of interesting opening scenes from movies.',
    lookingToMeet: 'Writers, actors, and anyone curious about making short films.', linkedin: '', photo: '',
  },
  {
    id: 'leo', name: 'Leo Martin', role: 'Product intern · 4th year',
    note: 'Happy to chat about getting your first internship in tech.',
    interests: ['Startups', 'Career'], connections: ['maya', 'dev'], color: 'yellow', education: 'Business and information systems, 4th year',
    funFact: 'I collect maps from cities I have visited.',
    lookingToMeet: 'Students exploring product roles or preparing for internships.', linkedin: '', photo: '',
  },
  {
    id: 'nina', name: 'Nina Okafor', role: 'Illustrator · 1st year',
    note: 'Sketchbook is always open. Currently learning motion design.',
    interests: ['Design', 'Creative'], connections: ['maya', 'zara'], color: 'rose', education: 'Visual communication, 1st year',
    funFact: 'I draw a tiny character in the corner of every notebook.',
    lookingToMeet: 'Artists who want to share work and learn motion design together.', linkedin: '', photo: '',
  },
  {
    id: 'dev', name: 'Dev Shah', role: 'Robotics club · 3rd year',
    note: 'Prototyping a low-cost robot arm and looking for collaborators.',
    interests: ['Coding', 'Robotics'], connections: ['arjun', 'leo'], color: 'mint', education: 'Mechatronics, 3rd year',
    funFact: 'My first robot was made from cardboard and an old toy motor.',
    lookingToMeet: 'People into robotics, prototyping, or learning by building.', linkedin: '', photo: '',
  },
  {
    id: 'you', name: 'Advik Ganapathy', role: 'AI/ML Enthusiast · 1st year',
    note: 'Prototyping a walking spider robot',
    interests: ['Coding', 'Music'], connections: [], color: 'peach', education: '',
    funFact: '', lookingToMeet: '', linkedin: '', photo: '',
  },
];

const CURRENT_USER_ID = 'you';
const PROFILE_STORAGE_KEY = 'linkup-current-profile';
const LOCATION_STORAGE_KEY = 'linkup-room-pin';
const CHECK_IN_STORAGE_KEY = 'linkup-checked-in';
const CONNECTIONS_STORAGE_KEY = 'linkup-connections';

const grid = document.querySelector('#attendee-grid');
const searchInput = document.querySelector('#search-input');
const filters = document.querySelector('#filters');
const count = document.querySelector('#attendee-count');
const emptyState = document.querySelector('#empty-state');
const roomMap = document.querySelector('#room-map');
const yourPin = document.querySelector('#your-pin');
const locationStatus = document.querySelector('#location-status');
const clearLocationButton = document.querySelector('#clear-location');
const checkInToggle = document.querySelector('#check-in-toggle');
const profileDialog = document.querySelector('#profile-dialog');
const profileView = document.querySelector('#profile-view');
const profileEditForm = document.querySelector('#profile-edit-form');
let selectedInterest = 'All';
let isCheckedIn = localStorage.getItem(CHECK_IN_STORAGE_KEY) !== 'false';
let currentConnections = new Set();
let profileReturnScroll = { x: 0, y: 0 };
let profileOpenScroll = { x: 0, y: 0 };
let profileReturnCardId = '';

// Load saved profile edits for the signed-in demo user, if there are any.
const savedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
if (savedProfile) {
  try {
    Object.assign(attendees.find((person) => person.id === CURRENT_USER_ID), JSON.parse(savedProfile));
  } catch {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
  }
}

const savedConnections = localStorage.getItem(CONNECTIONS_STORAGE_KEY);
if (savedConnections) {
  try {
    const connectionIds = JSON.parse(savedConnections);
    if (Array.isArray(connectionIds)) currentConnections = new Set(connectionIds);
  } catch {
    localStorage.removeItem(CONNECTIONS_STORAGE_KEY);
  }
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

function toggleConnection(personId) {
  const pagePosition = { x: window.scrollX, y: window.scrollY };
  if (currentConnections.has(personId)) {
    currentConnections.delete(personId);
  } else {
    currentConnections.add(personId);
  }
  localStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify([...currentConnections]));
  renderAttendees();
  requestAnimationFrame(() => {
    window.scrollTo(pagePosition.x, pagePosition.y);
    const updatedButton = [...grid.querySelectorAll('[data-connect-id]')]
      .find((button) => button.dataset.connectId === personId);
    updatedButton?.focus({ preventScroll: true });
  });
}

function showPin(x, y) {
  yourPin.style.left = `${x}%`;
  yourPin.style.top = `${y}%`;
  yourPin.hidden = false;
  locationStatus.textContent = 'Your pin is visible on this device';
  clearLocationButton.hidden = false;
}

function updateCheckInUI() {
  checkInToggle.textContent = isCheckedIn ? 'Check out' : 'Check in';
  if (!isCheckedIn) {
    yourPin.hidden = true;
    clearLocationButton.hidden = true;
    locationStatus.textContent = 'Checked out · your pin is hidden';
  } else if (yourPin.hidden) {
    locationStatus.textContent = 'Checked in · tap the map to add your spot';
  }
}

// Restore the pin only when this person is still checked in.
const savedLocation = localStorage.getItem(LOCATION_STORAGE_KEY);
if (savedLocation && isCheckedIn) {
  try {
    const { x, y } = JSON.parse(savedLocation);
    showPin(x, y);
  } catch {
    localStorage.removeItem(LOCATION_STORAGE_KEY);
    yourPin.hidden = true;
  }
} else {
  yourPin.hidden = true;
}

checkInToggle.addEventListener('click', () => {
  isCheckedIn = !isCheckedIn;
  localStorage.setItem(CHECK_IN_STORAGE_KEY, String(isCheckedIn));
  if (!isCheckedIn) {
    // Remove the location when checking out so an old spot is not left behind.
    localStorage.removeItem(LOCATION_STORAGE_KEY);
  }
  updateCheckInUI();
});

roomMap.addEventListener('click', (event) => {
  if (!isCheckedIn) {
    locationStatus.textContent = 'Check in before placing your pin';
    return;
  }
  const bounds = roomMap.getBoundingClientRect();
  const x = Math.min(96, Math.max(4, ((event.clientX - bounds.left) / bounds.width) * 100));
  const y = Math.min(91, Math.max(22, ((event.clientY - bounds.top) / bounds.height) * 100));
  showPin(x, y);
  localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({ x, y }));
});

clearLocationButton.addEventListener('click', () => {
  localStorage.removeItem(LOCATION_STORAGE_KEY);
  yourPin.hidden = true;
  clearLocationButton.hidden = true;
  locationStatus.textContent = 'Checked in · tap the map to add your spot';
});

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
    const matchesInterest = selectedInterest === 'All'
      || (selectedInterest === 'Mutuals' ? mutualCount > 0 : person.interests.includes(selectedInterest));
    const searchableText = `${person.name} ${person.role} ${person.note} ${person.interests.join(' ')}`.toLowerCase();
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
  card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  profileOpenScroll = { x: window.scrollX, y: window.scrollY };
  renderProfile(person);
  profileEditForm.hidden = true;
  profileView.hidden = false;
  profileDialog.showModal();
  // Keep the clicked card centered behind the modal while it is open.
  requestAnimationFrame(() => window.scrollTo(profileOpenScroll.x, profileOpenScroll.y));
}

function startProfileEdit() {
  const person = attendees.find((attendee) => attendee.id === CURRENT_USER_ID);
  for (const field of profileEditForm.elements) {
    if (field.name && person[field.name] !== undefined) field.value = person[field.name];
  }
  profileView.hidden = true;
  profileEditForm.hidden = false;
}

grid.addEventListener('click', (event) => {
  const connectButton = event.target.closest('[data-connect-id]');
  if (connectButton) {
    toggleConnection(connectButton.dataset.connectId);
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

profileEditForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const person = attendees.find((attendee) => attendee.id === CURRENT_USER_ID);
  const profileChanges = Object.fromEntries(new FormData(profileEditForm).entries());
  Object.assign(person, profileChanges);
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profileChanges));
  renderAttendees();
  renderProfile(person);
  profileEditForm.hidden = true;
  profileView.hidden = false;
});

document.querySelector('#cancel-profile-edit').addEventListener('click', () => {
  profileEditForm.hidden = true;
  profileView.hidden = false;
});

document.querySelector('#close-profile-dialog').addEventListener('click', () => profileDialog.close());
profileDialog.addEventListener('close', () => {
  // Wait for the browser's dialog focus restoration, then restore the old view.
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

renderFilters();
renderAttendees();
updateCheckInUI();
