// Sample event data. Each object is one attendee.
const attendees = [
  { name: 'Maya Chen', role: 'UX designer · 2nd year', note: 'Always up for swapping ideas about making things easier to use.', interests: ['Design', 'Startups'], color: 'peach' },
  { name: 'Arjun Rao', role: 'CS student · 3rd year', note: 'Building a tiny app to help people find pickup games on campus.', interests: ['Coding', 'Startups'], color: 'blue' },
  { name: 'Zara Patel', role: 'Film society · 2nd year', note: 'Looking for people to make a short film with this semester.', interests: ['Film', 'Creative'], color: 'lilac' },
  { name: 'Leo Martin', role: 'Product intern · 4th year', note: 'Happy to chat about getting your first internship in tech.', interests: ['Startups', 'Career'], color: 'yellow' },
  { name: 'Nina Okafor', role: 'Illustrator · 1st year', note: 'Sketchbook is always open. Currently learning motion design.', interests: ['Design', 'Creative'], color: 'rose' },
  { name: 'Dev Shah', role: 'Robotics club · 3rd year', note: 'Prototyping a low-cost robot arm and looking for collaborators.', interests: ['Coding', 'Robotics'], color: 'mint' },
  { name:'Advik Ganapathy',role:'AI/ML Enthusiast · 1st year',note:'Prototyping a walking spider robot',interests:['Coding','Music'],color:'peach'}
];

const grid = document.querySelector('#attendee-grid');
const searchInput = document.querySelector('#search-input');
const filters = document.querySelector('#filters');
const count = document.querySelector('#attendee-count');
const emptyState = document.querySelector('#empty-state');
const roomMap = document.querySelector('#room-map');
const yourPin = document.querySelector('#your-pin');
const locationStatus = document.querySelector('#location-status');
const clearLocationButton = document.querySelector('#clear-location');
let selectedInterest = 'All';

const savedLocation = localStorage.getItem('linkup-room-pin');

function showPin(x, y) {
  yourPin.style.left = `${x}%`;
  yourPin.style.top = `${y}%`;
  yourPin.hidden = false;
  locationStatus.textContent = 'Your pin is visible on this device';
  clearLocationButton.hidden = false;
}

if (savedLocation) {
  const { x, y } = JSON.parse(savedLocation);
  showPin(x, y);
} else {
  yourPin.hidden = true;
}

roomMap.addEventListener('click', (event) => {
  const bounds = roomMap.getBoundingClientRect();
  const x = Math.min(96, Math.max(4, ((event.clientX - bounds.left) / bounds.width) * 100));
  const y = Math.min(91, Math.max(22, ((event.clientY - bounds.top) / bounds.height) * 100));
  showPin(x, y);
  localStorage.setItem('linkup-room-pin', JSON.stringify({ x, y }));
});

clearLocationButton.addEventListener('click', (event) => {
  event.stopPropagation();
  localStorage.removeItem('linkup-room-pin');
  yourPin.hidden = true;
  clearLocationButton.hidden = true;
  locationStatus.textContent = 'No pin placed yet';
});

const interests = ['All', ...new Set(attendees.flatMap((person) => person.interests))];

function renderFilters() {
  filters.innerHTML = interests.map((interest) => `
    <button class="filter-button ${interest === selectedInterest ? 'active' : ''}" type="button" data-interest="${interest}">
      ${interest}
    </button>
  `).join('');
}

function renderAttendees() {
  const query = searchInput.value.trim().toLowerCase();
  const visibleAttendees = attendees.filter((person) => {
    const matchesInterest = selectedInterest === 'All' || person.interests.includes(selectedInterest);
    const searchableText = `${person.name} ${person.role} ${person.note} ${person.interests.join(' ')}`.toLowerCase();
    return matchesInterest && searchableText.includes(query);
  });

  count.textContent = visibleAttendees.length;
  emptyState.hidden = visibleAttendees.length > 0;
  grid.innerHTML = visibleAttendees.map((person) => `
    <article class="person-card">
      <div class="person-top">
        <div class="avatar ${person.color}" aria-hidden="true">${person.name.split(' ').map((part) => part[0]).join('')}</div>
        <div><h3 class="person-name">${person.name}</h3><p class="person-role">${person.role}</p></div>
      </div>
      <p class="person-note">${person.note}</p>
      <div class="tag-row">${person.interests.map((interest) => `<span class="tag">${interest}</span>`).join('')}</div>
    </article>
  `).join('');
}

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
