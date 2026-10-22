(() => {
  const storageKey = 'jsec-theme';
  const largeTextStorageKey = 'jsec-large-text';
  const defaultCalendarFilters = ['주간', '야간', '스키장', '골프장', '현관', 'other'];
  const initialTheme = localStorage.getItem(storageKey) === 'light' ? 'light' : 'dark';
  const initialLargeTextMode = localStorage.getItem(largeTextStorageKey) === 'true';
  const settings = {
    theme: initialTheme,
    large_text_mode: initialLargeTextMode,
    calendar_location_filters: defaultCalendarFilters,
    favorites: []
  };
  let userId = null;
  let loadPromise = null;
  let writeQueue = Promise.resolve();

  function applyTheme(theme) {
    const normalizedTheme = theme === 'light' ? 'light' : 'dark';
    settings.theme = normalizedTheme;
    document.documentElement.dataset.theme = normalizedTheme;
    localStorage.setItem(storageKey, normalizedTheme);
  }

  function applyLargeTextMode(enabled) {
    settings.large_text_mode = Boolean(enabled);
    document.documentElement.dataset.largeText = String(settings.large_text_mode);
    localStorage.setItem(largeTextStorageKey, String(settings.large_text_mode));
  }

  applyTheme(initialTheme);
  applyLargeTextMode(initialLargeTextMode);

  async function load() {
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) return settings;

        userId = session.user.id;
        const { data, error } = await supabaseClient
          .from('user_settings')
          .select('theme, large_text_mode, calendar_location_filters')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          if (data.theme === 'dark' || data.theme === 'light') applyTheme(data.theme);
          if (typeof data.large_text_mode === 'boolean') applyLargeTextMode(data.large_text_mode);
          if (Array.isArray(data.calendar_location_filters)) {
            settings.calendar_location_filters = data.calendar_location_filters;
          }
        }

        const { data: favoriteRows, error: favoritesError } = await supabaseClient
          .from('user_favorites')
          .select('favorite_type, favorite_key')
          .eq('user_id', userId);
        if (favoritesError) {
          console.warn('즐겨찾기를 불러오지 못했습니다.', favoritesError);
        } else {
          settings.favorites = (favoriteRows || []).filter(item =>
            ['menu', 'contact'].includes(item.favorite_type) && item.favorite_key
          ).map(item => ({ type: item.favorite_type, key: String(item.favorite_key) }));
        }
      } catch (error) {
        console.warn('사용자 설정을 불러오지 못했습니다. 기본 설정을 사용합니다.', error);
      }

      return settings;
    })();

    return loadPromise;
  }

  async function save(fields) {
    await load();
    if (!userId) return false;

    Object.assign(settings, fields);
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      const { error } = await supabaseClient
        .from('user_settings')
        .upsert({
          user_id: userId,
          theme: settings.theme,
          large_text_mode: settings.large_text_mode,
          calendar_location_filters: settings.calendar_location_filters,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      if (error) throw error;
    });

    try {
      await writeQueue;
      return true;
    } catch (error) {
      console.error('사용자 설정 저장 실패:', error);
      return false;
    }
  }

  async function toggleFavorite(type, key) {
    await load();
    const favoriteType = String(type || '');
    const favoriteKey = String(key || '');
    if (!userId) throw new Error('로그인이 필요합니다.');
    if (!['menu', 'contact'].includes(favoriteType) || !favoriteKey || favoriteKey.length > 2048) {
      throw new Error('즐겨찾기 항목이 올바르지 않습니다.');
    }

    const exists = settings.favorites.some(item => item.type === favoriteType && item.key === favoriteKey);
    const operation = exists
      ? supabaseClient.from('user_favorites').delete()
        .eq('user_id', userId).eq('favorite_type', favoriteType).eq('favorite_key', favoriteKey)
      : supabaseClient.from('user_favorites').upsert({
        user_id: userId,
        favorite_type: favoriteType,
        favorite_key: favoriteKey
      }, { onConflict: 'user_id,favorite_type,favorite_key' });
    const { error } = await operation;
    if (error) throw error;

    settings.favorites = exists
      ? settings.favorites.filter(item => item.type !== favoriteType || item.key !== favoriteKey)
      : [...settings.favorites, { type: favoriteType, key: favoriteKey }];
    window.dispatchEvent(new CustomEvent('jsec:favorites-changed', {
      detail: settings.favorites.map(item => ({ ...item }))
    }));
    return !exists;
  }

  window.userPreferences = {
    load,
    getSettings: () => ({ ...settings }),
    getFavorites: () => settings.favorites.map(item => ({ ...item })),
    toggleFavorite,
    setTheme: async theme => {
      applyTheme(theme);
      return save({ theme: settings.theme });
    },
    setLargeTextMode: async enabled => {
      applyLargeTextMode(enabled);
      return save({ large_text_mode: settings.large_text_mode });
    },
    saveCalendarFilters: filters => save({ calendar_location_filters: filters })
  };
})();