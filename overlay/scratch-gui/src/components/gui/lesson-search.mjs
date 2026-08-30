const normalizeSearchText = value => String(value || '')
    .toLocaleLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();

/** Match the same human-readable topic text that the lesson card renders. */
const lessonMatchesQuery = (item, copy, query) => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return true;
    const searchable = [
        copy.title,
        copy.objective,
        item.topic || '',
        ...item.domains,
        ...item.languages
    ].map(normalizeSearchText).join(' ');
    return searchable.includes(normalizedQuery);
};

export {lessonMatchesQuery, normalizeSearchText};
