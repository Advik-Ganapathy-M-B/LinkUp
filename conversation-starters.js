const COMMON_WORDS = new Set([
  'about', 'after', 'also', 'anyone', 'anything', 'build', 'building', 'currently',
  'from', 'good', 'into', 'interested', 'interest', 'interests', 'looking', 'meet',
  'meeting', 'people', 'project', 'projects', 'role', 'roles', 'share', 'someone',
  'student', 'students', 'that', 'their', 'there', 'these', 'they', 'this', 'those',
  'want', 'wanted', 'with', 'work', 'working', 'would', 'year',
]);

const SHORT_TECH_TERMS = new Set(['ai', 'api', 'c#', 'c++', 'cs', 'ml', 'sql', 'ui', 'ux']);

function normalized(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function sharedTerms(leftValues, rightValues) {
  const left = new Set(leftValues.flatMap((value) => [...normalized(value).matchAll(/[\p{L}\p{N}+#]+/gu)]
    .map(([term]) => term)));
  const right = new Set(rightValues.flatMap((value) => [...normalized(value).matchAll(/[\p{L}\p{N}+#]+/gu)]
    .map(([term]) => term)));

  return [...left]
    .filter((term) => right.has(term)
      && (term.length >= 4 || SHORT_TECH_TERMS.has(term))
      && !COMMON_WORDS.has(term))
    .sort((a, b) => a.localeCompare(b));
}

function excerpt(value, maxLength = 72) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function profileValues(person, keys) {
  return keys.map((key) => person?.[key]).filter(Boolean);
}

/** Build up to three explainable openers from the profile details both people shared. */
export function buildConversationStarters(viewer, attendee, limit = 3) {
  if (!viewer || !attendee || viewer.id === attendee.id || limit <= 0) return [];

  const starters = [];
  const add = (prompt, reason, key) => {
    if (starters.length >= limit || starters.some((starter) => starter.key === key)) return;
    starters.push({ prompt, reason, key });
  };

  const viewerInterests = Array.isArray(viewer.interests) ? viewer.interests : [];
  const attendeeInterests = Array.isArray(attendee.interests) ? attendee.interests : [];
  const attendeeInterestByName = new Map(
    attendeeInterests.map((interest) => [normalized(interest), interest.trim()]),
  );

  for (const interest of viewerInterests) {
    const label = attendeeInterestByName.get(normalized(interest));
    if (!label) continue;
    add(
      `What first got you interested in ${label}?`,
      `You both list ${label} as an interest.`,
      `interest:${normalized(label)}`,
    );
  }

  const overlappingGoalTerms = sharedTerms(
    profileValues(viewer, ['lookingToMeet']),
    profileValues(attendee, ['lookingToMeet']),
  );
  const sharedGoals = overlappingGoalTerms.filter((term) => !attendeeInterestByName.has(term));
  for (const term of sharedGoals) {
    const label = term.toLocaleUpperCase() === 'ai' || term.toLocaleUpperCase() === 'ml'
      ? term.toLocaleUpperCase()
      : term;
    add(
      `What kind of ${label}-focused people or projects are you hoping to find here?`,
      `Your networking goals both mention ${label}.`,
      `goal:${term}`,
    );
  }

  const sharedBackground = sharedTerms(
    profileValues(viewer, ['role', 'note', 'education']),
    profileValues(attendee, ['role', 'note', 'education']),
  ).filter((term) => !attendeeInterestByName.has(term) && !sharedGoals.includes(term));
  for (const term of sharedBackground) {
    const label = term.toLocaleUpperCase() === 'ai' || term.toLocaleUpperCase() === 'ml'
      ? term.toLocaleUpperCase()
      : term;
    add(
      `I noticed ${label} in both your backgrounds. What are you working on with it lately?`,
      `You both mention ${label} in your role, bio, or education details.`,
      `background:${term}`,
    );
  }

  if (starters.length < limit && attendee.funFact?.trim()) {
    const fact = excerpt(attendee.funFact);
    add(
      `What is the story behind your fun fact about “${fact}”?`,
      'It invites them to share more about a personal detail they chose to include.',
      'fallback:fun-fact',
    );
  }
  if (starters.length < limit && attendee.lookingToMeet?.trim() && overlappingGoalTerms.length === 0) {
    const goal = excerpt(attendee.lookingToMeet, 58);
    add(
      `I saw you are hoping to meet ${goal}. What kind of connection are you looking for?`,
      'It follows up on a networking goal they chose to share.',
      'fallback:goal',
    );
  }
  if (starters.length < limit && attendee.note?.trim() && sharedBackground.length === 0) {
    const about = excerpt(attendee.note, 66);
    add(
      `Your profile says “${about}”. What got you interested in that?`,
      'It gives them an easy opening to talk about something from their profile.',
      'fallback:about',
    );
  }
  if (starters.length < limit && attendee.role?.trim() && attendee.role !== 'New attendee'
      && sharedBackground.length === 0) {
    add(
      `What has your experience as ${excerpt(attendee.role, 58)} been like?`,
      'It starts from the role or background they chose to share.',
      'fallback:role',
    );
  }

  return starters;
}
