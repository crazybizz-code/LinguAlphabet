// Time formatting
export function formatTime(seconds) {
  if (isNaN(seconds) || seconds === null) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const pad = (num) => String(num).padStart(2, '0');
  
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export function parseTimecode(timecode) {
  // "00:02:05" -> 125000 ms
  if (!timecode) return 0;
  const parts = timecode.split(':').map(Number);
  let secs = 0;
  if (parts.length === 3) {
    secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    secs = parts[0] * 60 + parts[1];
  } else {
    secs = parts[0] || 0;
  }
  return secs * 1000;
}

// String utilities
export function fuzzyMatch(query, target, tolerance = 2) {
  if (!query || !target) return false;
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase().trim();
  
  if (t.includes(q)) return true;
  
  const wordsQ = q.split(/\s+/);
  const wordsT = t.split(/\s+/);
  
  // Check if any word has low Levenshtein distance
  for (const wq of wordsQ) {
    if (wq.length < 3) continue; // Skip very short words for distance matching
    for (const wt of wordsT) {
      if (levenshteinDistance(wq, wt) <= tolerance) {
        return true;
      }
    }
  }
  return false;
}

export function levenshteinDistance(str1, str2) {
  const track = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null));
  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }
  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  return track[str2.length][str1.length];
}

// Validation
export function validatePodcastData(data) {
  const errors = [];
  
  if (!data.title || data.title.length < 5 || data.title.length > 200) {
    errors.push("Title must be between 5 and 200 characters.");
  }
  
  if (!data.description || data.description.length < 20 || data.description.length > 2000) {
    errors.push("Description must be between 20 and 2000 characters.");
  }
  
  const duration = Number(data.duration);
  if (isNaN(duration) || duration < 300 || duration > 14400) {
    errors.push("Duration must be between 300 seconds (5 mins) and 14400 seconds (4 hours).");
  }
  
  if (!validateLanguage(data.language)) {
    errors.push(`Language '${data.language}' is not supported. Supported: English, German, Spanish, French, Russian, Uzbek, Turkish, Chinese, Arabic.`);
  }
  
  if (!validateCategory(data.category)) {
    errors.push(`Category '${data.category}' is not supported. Supported categories: Physics, Chemistry, Biology, Medicine, History, Technology, Economics, Psychology, Literature, Mathematics.`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateLanguage(lang) {
  const validLangs = ['English', 'German', 'Spanish', 'French', 'Russian', 'Uzbek', 'Turkish', 'Chinese', 'Arabic'];
  return validLangs.includes(lang);
}

export function validateCategory(category) {
  const validCategories = ['Physics', 'Chemistry', 'Biology', 'Medicine', 'History', 'Technology', 'Economics', 'Psychology', 'Literature', 'Mathematics'];
  return validCategories.includes(category);
}

// DOM utilities
export function createElement(tag, className = '', innerHTML = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (innerHTML) el.innerHTML = innerHTML;
  return el;
}

export function setStyles(element, styles) {
  Object.assign(element.style, styles);
}

// Date utilities
export function getFormattedDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

export function getDaysAgo(dateString) {
  if (!dateString) return 0;
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Color utilities
export function getLanguageColor(language) {
  const colors = {
    'English': '#6366f1',
    'Spanish': '#ec4899',
    'German': '#f59e0b',
    'French': '#06b6d4',
    'Russian': '#8b5cf6',
    'Uzbek': '#10b981',
    'Turkish': '#ef4444',
    'Chinese': '#f43f5e',
    'Arabic': '#14b8a6'
  };
  return colors[language] || '#94a3b8';
}

export function getCategoryIcon(category) {
  const icons = {
    'Physics': '⚛️',
    'Chemistry': '🧪',
    'Biology': '🧬',
    'Medicine': '🏥',
    'History': '📜',
    'Technology': '💻',
    'Economics': '📈',
    'Psychology': '🧠',
    'Literature': '📚',
    'Mathematics': '∑'
  };
  return icons[category] || '📖';
}
