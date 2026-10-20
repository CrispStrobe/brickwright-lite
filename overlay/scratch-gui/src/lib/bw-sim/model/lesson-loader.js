// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Lessons are local static assets, loaded only when the learner opens one.
export const lessonId = entry => {
    const id = String(entry.id || entry.file || '').replace(/\.ldr$/i, '');
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid model lesson identifier');
    return id;
};
export const loadModelLesson = async (entry, locale, {fetcher = fetch, signal} = {}) => {
    const id = lessonId(entry), language = locale === 'de' ? 'de' : 'en';
    const res = await fetcher(`static/sim-lab/lessons/${id}.${language}.json`, {signal});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lesson = await res.json();
    if (lesson.version !== 1 || lesson.id !== id || lesson.language !== language ||
        !['what', 'why', 'matters', 'question', 'answer'].every(k => typeof lesson[k] === 'string' && lesson[k].trim()) ||
        !['try', 'further'].every(k => Array.isArray(lesson[k]) && lesson[k].length && lesson[k].every(s => typeof s === 'string' && s.trim())) ||
        !Array.isArray(lesson.related)) throw new Error('Incomplete model lesson');
    return lesson;
};
