(() => {
  const storageKey = 'jsec-theme';
  const largeTextStorageKey = 'jsec-large-text';
  const defaultCalendarFilters = ['주간', '야간', '스키장', '골프장', '현관', 'other'];
  const initialTheme = localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light';
  const initialLargeTextMode = localStorage.getItem(largeTextStorageKey) === 'true';
  const settings = {
    theme: initialTheme,
    large_text_mode: initialLargeTextMode,
    calendar_location_filters: defaultCalendarFilters
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

  window.userPreferences = {
    load,
    getSettings: () => ({ ...settings }),
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