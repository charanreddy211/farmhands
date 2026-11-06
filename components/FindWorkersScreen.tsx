import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from './AppText';
import AppTextInput from './AppTextInput';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { fetchWorkers, saveWorkerSearchAlert, WorkerProfile, WorkerSearchParams, WorkerSearchResponse } from '../api/workers';
import { colors } from '../theme';

type Props = {
  farmerId: string;
  alertCount: number;
  alertCountError: string;
  initialSelectedWorkers: WorkerProfile[];
  onPostRequest: (workers: WorkerProfile[], requestDetails: { from: string; to: string; peopleNeeded: number }) => void;
  onOpenProfile: () => void;
  onOpenBookings: () => void;
  onOpenAlerts: () => void;
  onOpenSavedWorkers: () => void;
  initialSearchDates?: { from: string; to: string } | null;
};

function Icon({ name, size = 20, color = colors.text }: { name: keyof typeof Ionicons.glyphMap; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dateLabel(value: string, includeYear = false): string {
  return dateFromKey(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
}

function dateChipLabel(value: string): string {
  return dateFromKey(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
}

function rangeLabel(from: string, to: string): string {
  return from === to ? dateLabel(from) : `${dateLabel(from)} – ${dateLabel(to)}`;
}

function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function daysBetween(from: string, to: string): number {
  return Math.round((dateFromKey(to).getTime() - dateFromKey(from).getTime()) / 86400000) + 1;
}

function workerSearchCacheKey(params: WorkerSearchParams): string {
  return `farmhands.worker-search.${params.farmerId ?? 'anonymous'}`;
}

function makeSearchParams(input: {
  from: string;
  to: string;
  location: { latitude: number; longitude: number } | null;
  distance: number | null;
  rating: number | null;
  skill: string | null;
  query: string;
  farmerId: string;
  workedWithMe: boolean;
}): WorkerSearchParams {
  return {
    from: input.from,
    to: input.to,
    ...(input.location ? { latitude: input.location.latitude, longitude: input.location.longitude } : {}),
    maxDistanceKm: input.distance,
    minRating: input.rating,
    skill: input.skill,
    query: input.query,
    farmerId: input.farmerId,
    workedWithMe: input.workedWithMe,
  };
}

export default function FindWorkersScreen({
  farmerId,
  alertCount,
  alertCountError,
  initialSelectedWorkers,
  onPostRequest,
  onOpenProfile,
  onOpenBookings,
  onOpenAlerts,
  onOpenSavedWorkers,
  initialSearchDates,
}: Props) {
  const today = dateKey(new Date());
  const [from, setFrom] = useState(initialSearchDates?.from ?? today);
  const [to, setTo] = useState(initialSearchDates?.to ?? today);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const date = initialSearchDates ? dateFromKey(initialSearchDates.from) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [pickingDates, setPickingDates] = useState(false);
  const [selectingEndDate, setSelectingEndDate] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [skill, setSkill] = useState<string | null>(null);
  const [workedWithMe, setWorkedWithMe] = useState(false);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [result, setResult] = useState<WorkerSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offlineResults, setOfflineResults] = useState(false);
  const [cacheWarning, setCacheWarning] = useState('');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [selectedWorkersById, setSelectedWorkersById] = useState<Record<string, WorkerProfile>>(
    () => Object.fromEntries(initialSelectedWorkers.map((worker) => [worker.id, worker])),
  );
  const selectedWorkerIds = Object.keys(selectedWorkersById);
  const [peopleNeeded, setPeopleNeeded] = useState(1);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [savingAlert, setSavingAlert] = useState(false);
  const [alertSaved, setAlertSaved] = useState(false);
  const [alertError, setAlertError] = useState('');

  const searchParams = useMemo(() => makeSearchParams({
    from, to, location, distance, rating, skill, query, farmerId, workedWithMe,
  }), [from, to, location, distance, rating, skill, query, farmerId, workedWithMe]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setOfflineResults(false);
    setCacheWarning('');
    setAlertSaved(false);
    const timer = setTimeout(() => {
      fetchWorkers(searchParams)
        .then(async (response) => {
          if (active) setResult(response);
          try {
            await AsyncStorage.setItem(workerSearchCacheKey(searchParams), JSON.stringify({ params: searchParams, result: response }));
          } catch (cacheError) {
            if (active) setCacheWarning(cacheError instanceof Error
              ? `Search loaded, but offline results could not be saved: ${cacheError.message}`
              : 'Search loaded, but offline results could not be saved.');
          }
        })
        .catch(async (loadError) => {
          if (!active) return;
          try {
            const cached = await AsyncStorage.getItem(workerSearchCacheKey(searchParams));
            if (cached) {
              const saved = JSON.parse(cached) as { params?: WorkerSearchParams; result?: WorkerSearchResponse };
              if (JSON.stringify(saved.params) === JSON.stringify(searchParams)
                && Array.isArray(saved.result?.workers) && typeof saved.result.availableCount === 'number') {
                if (!active) return;
                setResult(saved.result);
                setOfflineResults(true);
                return;
              }
            }
          } catch (cacheError) {
            if (active) setError(cacheError instanceof Error
              ? `Could not read saved worker results: ${cacheError.message}`
              : 'Could not read saved worker results.');
            return;
          }
          if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load worker profiles.');
        })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [searchParams, retryAttempt]);

  useEffect(() => {
    if (!result) return;
    const visibleWorkers = new Map(result.workers.map((worker) => [worker.id, worker]));
    const bookedWorkerIds = new Set(result.bookedWorkerIds ?? []);
    setSelectedWorkersById((current) => Object.fromEntries(
      Object.entries(current).filter(([id]) => !bookedWorkerIds.has(id) && (!visibleWorkers.has(id) || visibleWorkers.get(id)?.available)),
    ));
  }, [result]);

  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const count = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    const mondayOffset = (first.getDay() + 6) % 7;
    return [
      ...Array.from({ length: mondayOffset }, () => null),
      ...Array.from({ length: count }, (_, index) => new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1)),
    ];
  }, [calendarMonth]);

  const selectedWorker = result?.workers.find((worker) => worker.id === selectedWorkerId) ?? null;
  const isRangeAvailable = result !== null && result.availableCount > 0;
  const selectedCount = selectedWorkerIds.length;
  const selectedPeopleCount = Object.values(selectedWorkersById).reduce((total, worker) => total + (worker.groupSize ?? 1), 0);
  const selectedPeopleForRequest = Math.min(peopleNeeded, selectedPeopleCount);

  async function enableLocation(): Promise<boolean> {
    if (location) return true;
    setLocationLoading(true);
    setAlertError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Allow location access to filter workers by distance.');
        return false;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      setError('');
      return true;
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : 'Could not get your location.');
      return false;
    } finally {
      setLocationLoading(false);
    }
  }

  async function selectDistance(value: number | null) {
    if (value !== null && !(await enableLocation())) return;
    setDistance(value);
  }

  function chooseCalendarDate(date: Date) {
    const key = dateKey(date);
    if (key < today) return;
    if (!selectingEndDate || key < from) {
      setFrom(key);
      setTo(key);
      setSelectingEndDate(true);
    } else {
      if (daysBetween(from, key) > 31) {
        setError('Choose a date range of 31 days or fewer.');
        return;
      }
      setTo(key);
      setSelectingEndDate(false);
    }
    setError('');
    setAlertSaved(false);
  }

  function setQuickDateRange(kind: 'tomorrow' | 'weekend') {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    if (kind === 'weekend') {
      const daysUntilSaturday = (6 - start.getDay() + 7) % 7;
      start.setDate(start.getDate() + daysUntilSaturday);
    }
    const end = new Date(start);
    if (kind === 'weekend') end.setDate(end.getDate() + 1);
    setFrom(dateKey(start));
    setTo(dateKey(end));
    setCalendarMonth(new Date(start.getFullYear(), start.getMonth(), 1));
    setSelectingEndDate(false);
    setAlertSaved(false);
  }

  function toggleWorker(worker: WorkerProfile) {
    if (!worker.available) return;
    setSelectedWorkersById((current) => {
      if (current[worker.id]) {
        const next = { ...current };
        delete next[worker.id];
        return next;
      }
      return { ...current, [worker.id]: worker };
    });
  }

  function resetFilters() {
    setDistance(null);
    setRating(null);
    setSkill(null);
    setWorkedWithMe(false);
    setQuery('');
    setAlertSaved(false);
  }

  async function saveAlert() {
    setSavingAlert(true);
    setAlertError('');
    try {
      await saveWorkerSearchAlert({ ...searchParams, farmerId });
      setAlertSaved(true);
    } catch (saveError) {
      setAlertError(saveError instanceof Error ? saveError.message : 'Could not save your search alert.');
    } finally {
      setSavingAlert(false);
    }
  }

  function openSuggestedDate(value: string) {
    setFrom(value);
    setTo(value);
    setCalendarMonth(new Date(dateFromKey(value).getFullYear(), dateFromKey(value).getMonth(), 1));
  }

  function chooseQuickDate(value: string) {
    setFrom(value);
    setTo(value);
    const date = dateFromKey(value);
    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setSelectingEndDate(false);
    setAlertSaved(false);
  }

  const monthTitle = calendarMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const tomorrowDate = dateFromKey(today);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = dateKey(tomorrowDate);

  if (pickingDates) {
    return <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageTitleRow}>
          <Pressable style={styles.backButton} onPress={() => setPickingDates(false)} accessibilityRole="button" accessibilityLabel="Back to worker search">
            <Icon name="chevron-back" size={22} />
          </Pressable>
          <Text style={styles.pageTitle}>Pick dates</Text>
        </View>
        <View style={styles.monthHeader}>
          <Text style={styles.monthTitle}>{monthTitle}</Text>
          <View style={styles.monthControls}>
            <MonthButton label="Previous month" icon="chevron-back" onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
            <MonthButton label="Next month" icon="chevron-forward" onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
          </View>
        </View>
        <View style={styles.calendarGrid}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>)}
          {calendarDays.map((date, index) => {
            if (!date) return <View key={`empty-${index}`} style={styles.calendarCell} />;
            const key = dateKey(date);
            const past = key < today;
            const selected = key >= from && key <= to;
            return <Pressable
              key={key}
              style={[styles.calendarCell, selected && styles.calendarDaySelected, past && styles.calendarDayPast]}
              onPress={() => chooseCalendarDate(date)}
              disabled={past}
              accessibilityRole="button"
              accessibilityLabel={date.toLocaleDateString('en-IN', { dateStyle: 'full' })}
              accessibilityState={{ selected, disabled: past }}
            >
              <Text style={[styles.calendarDayText, selected && styles.calendarDayTextSelected, past && styles.calendarDayTextPast]}>{date.getDate()}</Text>
            </Pressable>;
          })}
        </View>
        <View style={styles.quickActions}>
          <Pill label="Tomorrow" onPress={() => setQuickDateRange('tomorrow')} />
          <Pill label="This weekend" onPress={() => setQuickDateRange('weekend')} />
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{rangeLabel(from, to)} · {daysBetween(from, to)} {daysBetween(from, to) === 1 ? 'day' : 'days'}</Text>
          <Text style={styles.summaryText}>{loading ? 'Checking availability…' : `${result?.availableCount ?? 0} workers free for all selected days`}</Text>
        </View>
        {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
      </ScrollView>
      <View style={styles.stickyFooter}>
        <PrimaryButton label={loading ? 'Checking workers…' : `Show ${result?.availableCount ?? 0} free workers`} onPress={() => setPickingDates(false)} disabled={loading} />
      </View>
    </View>;
  }

  if (selectedWorker) {
    return <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageTitleRow}>
          <Pressable style={styles.backButton} onPress={() => setSelectedWorkerId(null)} accessibilityRole="button" accessibilityLabel="Back to search results">
            <Icon name="chevron-back" size={22} />
          </Pressable>
          <Text style={styles.pageTitle}>{selectedWorker.name}</Text>
        </View>
        <View style={styles.profileHero}>
          <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{initials(selectedWorker.name)}</Text></View>
          <View style={styles.profileHeaderCopy}>
            <Text style={styles.profileName}>{selectedWorker.name}</Text>
            <Text style={styles.profileMeta}><Icon name="location-outline" size={17} color={colors.muted} /> {selectedWorker.distanceKm === null ? selectedWorker.area || 'Location not set' : `${selectedWorker.distanceKm} km away · ${selectedWorker.area}`}</Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <Stat value={selectedWorker.reviewCount ? String(selectedWorker.reviewCount) : '—'} label="reviews" />
          <Stat value={selectedWorker.rating === null ? '—' : selectedWorker.rating.toFixed(1)} label="average rating" />
          <Stat value={selectedWorker.travelRadius === null ? '—' : `${selectedWorker.travelRadius} km`} label="travel radius" />
        </View>
        <View style={styles.chipRow}>
          {selectedWorker.skills.map((item) => <View key={item} style={styles.outlineChip}><Text style={styles.outlineChipText}>{item}</Text></View>)}
          {!selectedWorker.skills.length && <Text style={styles.mutedText}>No skills added yet.</Text>}
        </View>
        <View style={styles.infoCard}>
          <ProfileRow label="Daily rate" value={selectedWorker.dailyRate === null ? 'Not set' : `₹${selectedWorker.dailyRate}`} />
          <View style={styles.divider} />
          <ProfileRow label="Preferred shift" value={selectedWorker.labourShift === 'morning' ? 'Morning' : 'Full day'} />
          {(selectedWorker.groupSize ?? 1) > 1 && <>
            <View style={styles.divider} />
            <ProfileRow label={selectedWorker.groupName || 'Work group'} value={`${selectedWorker.groupSize} people`} />
          </>}
          <View style={styles.divider} />
          <ProfileRow label="Your reviews" value={selectedWorker.myReviewCount ? `${selectedWorker.myReviewCount} submitted` : 'None yet'} />
        </View>
        <Text style={styles.sectionTitle}>Availability</Text>
        <View style={styles.weekStrip}>
          {Array.from({ length: 7 }, (_, index) => {
            const date = dateFromKey(from);
            date.setDate(date.getDate() + index);
            const key = dateKey(date);
            const available = selectedWorker.availableDates.includes(key);
            return <View key={key} style={[styles.weekDay, available && styles.weekDayAvailable]}>
              <Text style={[styles.weekDayName, available && styles.weekDayTextAvailable]}>{date.toLocaleDateString('en-IN', { weekday: 'short' }).charAt(0)}</Text>
              <Text style={[styles.weekDayNumber, available && styles.weekDayTextAvailable]}>{date.getDate()}</Text>
            </View>;
          })}
        </View>
        <View style={styles.reviewCard}>
          {selectedWorker.latestReview
            ? <>
              <Text style={styles.reviewHeading}>★ {selectedWorker.latestReview.rating.toFixed(1)}  {selectedWorker.latestReview.farmerName || 'Farmer'}</Text>
              <Text style={styles.reviewText}>{selectedWorker.latestReview.comment || 'No written comment.'}</Text>
              <Text style={styles.reviewMeta}>{selectedWorker.reviewCount} reviews on record</Text>
            </>
            : <>
              <Text style={styles.reviewHeading}>No ratings yet</Text>
              <Text style={styles.reviewText}>Worker reviews will appear here after farmers submit them.</Text>
            </>}
        </View>
        {!selectedWorker.available && <Text style={styles.lockHint}>This worker is not free for {rangeLabel(from, to)}.</Text>}
      </ScrollView>
      <View style={styles.stickyFooter}>
        <PrimaryButton
          label={selectedWorker.available
            ? selectedWorkerIds.includes(selectedWorker.id) ? 'Remove from selection' : 'Select worker'
            : 'Choose another worker'}
          onPress={() => {
            if (selectedWorker.available) toggleWorker(selectedWorker);
            else setSelectedWorkerId(null);
          }}
          disabled={!selectedWorker.available && loading}
        />
      </View>
    </View>;
  }

  const noWorkers = !loading && !error && (result?.total ?? 0) === 0;
  const noOneFree = !loading && !error && (result?.total ?? 0) > 0 && !isRangeAvailable;

  return <View style={styles.page}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.heading}>Find <Text style={styles.headingAccent}>workers</Text></Text>
          <Text style={styles.subtitle}>పనివారిని వెతకండి</Text>
        </View>
        <View style={styles.headingActions}>
          <Pressable style={styles.avatarButton} onPress={onOpenSavedWorkers} accessibilityRole="button" accessibilityLabel="Open My workers">
            <Icon name="bookmark-outline" size={21} color={colors.primary} />
          </Pressable>
          <Pressable style={styles.avatarButton} onPress={() => { void enableLocation(); }} accessibilityRole="button" accessibilityLabel={location ? 'Location enabled' : 'Enable your location'}>
            {locationLoading ? <ActivityIndicator color={colors.text} /> : <Icon name={location ? 'location' : 'locate-outline'} size={22} />}
          </Pressable>
        </View>
      </View>

      <View style={styles.topFilters}>
        <Pressable style={styles.iconFilterButton} onPress={() => setFiltersOpen(true)} accessibilityRole="button" accessibilityLabel="Open filters">
          <Icon name="options-outline" size={20} />
        </Pressable>
        <Pressable
          style={[styles.pill, from === today && to === today && styles.pillActive]}
          onPress={() => chooseQuickDate(today)}
          accessibilityRole="button"
          accessibilityState={{ selected: from === today && to === today }}
        >
          <Text style={[styles.pillText, from === today && to === today && styles.pillActiveText]}>{dateChipLabel(today)}</Text>
        </Pressable>
        <Pressable
          style={[styles.pill, from === tomorrow && to === tomorrow && styles.pillActive]}
          onPress={() => chooseQuickDate(tomorrow)}
          accessibilityRole="button"
          accessibilityState={{ selected: from === tomorrow && to === tomorrow }}
        >
          <Text style={[styles.pillText, from === tomorrow && to === tomorrow && styles.pillActiveText]}>{dateChipLabel(tomorrow)}</Text>
        </Pressable>
        <Pressable style={styles.pill} onPress={() => { setSelectingEndDate(false); setPickingDates(true); }} accessibilityRole="button">
          <Icon name="calendar-outline" size={17} />
          <Text style={styles.pillText}>Dates</Text>
        </Pressable>
      </View>

      {!loading && !error && result && <Text style={styles.availabilitySummary}>
        <Text style={styles.summaryEmphasis}>{result.availableCount} free</Text> on {rangeLabel(from, to)}
      </Text>}
      {offlineResults && !loading && <View style={styles.offlineBanner} accessibilityRole="alert">
        <Icon name="cloud-offline-outline" size={18} color={colors.text} />
        <Text style={styles.offlineText}>You’re offline. Showing saved results for these exact filters; availability may have changed.</Text>
      </View>}
      {!!cacheWarning && <Text style={styles.errorText} accessibilityRole="alert">{cacheWarning}</Text>}

      {loading && <Message icon="people-outline" title="Finding local workers…" />}
      {!!error && !loading && <View style={styles.messageCard}>
        <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>
        <Pressable onPress={() => setRetryAttempt((attempt) => attempt + 1)} accessibilityRole="button"><Text style={styles.retryText}>Try again</Text></Pressable>
      </View>}

      {noWorkers && <View style={styles.emptyState}>
        <View style={styles.emptyIcon}><Icon name="people-outline" size={32} color={colors.primary} /></View>
        <Text style={styles.emptyTitle}>No workers match these filters</Text>
        <Text style={styles.emptyText}>Try a wider distance, another skill, or different search dates.</Text>
        <Pressable onPress={resetFilters} accessibilityRole="button"><Text style={styles.retryText}>Clear filters</Text></Pressable>
      </View>}

      {noOneFree && <View style={styles.noFreeState}>
        <View style={styles.emptyIcon}><Icon name="calendar-outline" size={32} color={colors.primary} /></View>
        <Text style={styles.emptyTitle}>No one is free on {rangeLabel(from, to)}</Text>
        <Text style={styles.emptyText}>Save this search for later, or try a nearby date with worker availability.</Text>
        <Pressable style={styles.notifyButton} onPress={() => { void saveAlert(); }} disabled={savingAlert || offlineResults} accessibilityRole="button">
          {savingAlert ? <ActivityIndicator color="#FFFFFF" /> : <Icon name={alertSaved ? 'checkmark-circle-outline' : 'notifications-outline'} color="#FFFFFF" size={21} />}
          <Text style={styles.notifyButtonText}>{savingAlert ? 'Saving alert…' : alertSaved ? 'Search saved' : 'Save search alert'}</Text>
        </Pressable>
        {!!alertError && <Text style={styles.errorText} accessibilityRole="alert">{alertError}</Text>}
        {offlineResults && <Text style={styles.errorText}>Reconnect to save this search alert.</Text>}
        {alertSaved && <Text style={styles.savedAlertText}>Search saved. Push and SMS alert delivery is not configured yet.</Text>}
        {!!result?.suggestions.length && <View style={styles.suggestionsCard}>
          <Text style={styles.sectionTitle}>Nearby dates</Text>
          {result.suggestions.map((suggestion) => <Pressable key={suggestion.date} style={styles.suggestionRow} onPress={() => openSuggestedDate(suggestion.date)} accessibilityRole="button">
            <View><Text style={styles.suggestionTitle}>{dateLabel(suggestion.date, true)}</Text><Text style={styles.mutedText}>{suggestion.workerCount} {suggestion.workerCount === 1 ? 'worker' : 'workers'} free</Text></View>
            <Icon name="chevron-forward" size={21} color={colors.text} />
          </Pressable>)}
        </View>}
      </View>}

      {!loading && !error && !noWorkers && !noOneFree && <View style={styles.workerList}>
        {result?.workers.filter((worker) => worker.available).map((worker) => {
          const selected = selectedWorkerIds.includes(worker.id);
          return <View key={worker.id} style={[styles.workerCard, selected && styles.workerCardSelected]}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials(worker.name)}</Text></View>
            <View style={styles.workerCopy}>
              <View style={styles.nameAndBadge}>
                <Pressable onPress={() => setSelectedWorkerId(worker.id)} accessibilityRole="button" accessibilityLabel={`View ${worker.name}'s profile`}>
                  <Text style={styles.workerName}>{worker.name}</Text>
                </Pressable>
                <View style={styles.availableBadge}><Text style={styles.availableBadgeText}>{(worker.groupSize ?? 1) > 1 ? `${worker.groupSize} PEOPLE` : 'SOLO'}</Text></View>
              </View>
              <Text style={styles.workerMeta}>
                {worker.rating === null ? 'No ratings yet' : `★ ${worker.rating.toFixed(1)} · ${worker.reviewCount} reviews`}
                {worker.distanceKm === null ? '' : ` · ${worker.distanceKm} km`}
              </Text>
              <Text style={styles.workerRate}>
                {worker.dailyRate === null ? 'Daily rate not set' : `₹${worker.dailyRate}/day`}
                {worker.area ? ` · ${worker.area}` : ''}
              </Text>
            </View>
            <Pressable
              style={[styles.selectionBox, selected && styles.selectionBoxSelected, offlineResults && styles.selectionBoxDisabled]}
              onPress={() => toggleWorker(worker)}
              disabled={offlineResults}
              accessibilityRole="checkbox"
              accessibilityLabel={`Select ${worker.name}`}
              accessibilityState={{ checked: selected, disabled: offlineResults }}
            >
              {selected && <Icon name="checkmark" size={20} color="#FFFFFF" />}
            </Pressable>
          </View>;
        })}
      </View>}

    </ScrollView>

    {selectedCount > 0 && <View style={styles.stickyFooter}>
      <PrimaryButton
        label={`Send request · ${selectedPeopleForRequest} of ${peopleNeeded} people`}
        onPress={() => onPostRequest(Object.values(selectedWorkersById), { from, to, peopleNeeded })}
        disabled={selectedCount === 0 || selectedPeopleCount < peopleNeeded || offlineResults}
      />
    </View>}

    {!!alertCountError && <Text style={styles.alertCountError} accessibilityRole="alert">{alertCountError}</Text>}
    <View style={styles.bottomTabs} accessibilityRole="tablist">
      <BottomTab label="Find" icon="search-outline" selected onPress={() => undefined} />
      <BottomTab label="Bookings" icon="reader-outline" onPress={onOpenBookings} />
      <BottomTab label="Alerts" icon="notifications-outline" badgeCount={alertCount} onPress={onOpenAlerts} />
      <BottomTab label="Profile" icon="person-outline" onPress={onOpenProfile} />
    </View>

    <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setFiltersOpen(false)} accessibilityRole="button" accessibilityLabel="Close filters" />
        <View style={styles.filterSheet}>
          <View style={styles.filterHeading}>
            <Text style={styles.filterTitle}>Filters</Text>
            <Pressable onPress={resetFilters} accessibilityRole="button"><Text style={styles.resetText}>Reset</Text></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <FilterSection title="Search">
              <View style={styles.searchBox}>
                <Icon name="search-outline" size={20} color={colors.muted} />
                <AppTextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Worker, skill, or village"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Search workers, skills, or villages"
                  returnKeyType="search"
                />
                {!!query && <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search">
                  <Icon name="close-circle" size={19} color={colors.muted} />
                </Pressable>}
              </View>
            </FilterSection>
            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>People needed</Text>
              <View style={styles.peopleControls}>
                <RoundButton label="Reduce number of people" icon="remove" onPress={() => setPeopleNeeded((value) => Math.max(1, value - 1))} />
                <Text style={styles.peopleCount}>{peopleNeeded}</Text>
                <RoundButton label="Add number of people" icon="add" onPress={() => setPeopleNeeded((value) => Math.min(100, value + 1))} />
              </View>
            </View>
            <FilterSection title="Distance">
              <FilterPill label="Any" selected={distance === null} onPress={() => { void selectDistance(null); }} />
              {[10, 25, 50].map((value) => <FilterPill key={value} label={`${value} km`} selected={distance === value} onPress={() => { void selectDistance(value); }} />)}
            </FilterSection>
            <FilterSection title="Rating">
              <FilterPill label="Any" selected={rating === null} onPress={() => setRating(null)} />
              {[4, 4.5].map((value) => <FilterPill key={value} label={`${value.toFixed(1)}+`} selected={rating === value} onPress={() => setRating(value)} />)}
            </FilterSection>
            <FilterSection title="Skills">
              <FilterPill label="All skills" selected={skill === null} onPress={() => setSkill(null)} />
              {(result?.skills ?? []).map((value) => <FilterPill key={value} label={value} selected={skill === value} onPress={() => setSkill(skill === value ? null : value)} />)}
            </FilterSection>
            <Pressable
              style={styles.workedWithRow}
              onPress={() => setWorkedWithMe((current) => !current)}
              accessibilityRole="switch"
              accessibilityLabel="Only workers I have reviewed"
              accessibilityState={{ checked: workedWithMe }}
            >
              <Text style={styles.workedWithText}>Only workers I have reviewed</Text>
              <View style={[styles.switchTrack, workedWithMe && styles.switchTrackOn]}>
                <View style={[styles.switchThumb, workedWithMe && styles.switchThumbOn]} />
              </View>
            </Pressable>
          </ScrollView>
          <PrimaryButton label={`Show ${result?.total ?? 0} workers`} onPress={() => setFiltersOpen(false)} disabled={loading} />
        </View>
      </View>
    </Modal>
  </View>;
}

function Message({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return <View style={styles.messageCard}><ActivityIndicator color={colors.primary} /><Icon name={icon} color={colors.muted} /><Text style={styles.messageText}>{title}</Text></View>;
}

function MonthButton({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return <Pressable style={styles.monthButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}><Icon name={icon} size={21} /></Pressable>;
}

function RoundButton({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return <Pressable style={styles.roundButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}><Icon name={icon} size={21} /></Pressable>;
}

function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable style={styles.pill} onPress={onPress} accessibilityRole="button"><Text style={styles.pillText}>{label}</Text></Pressable>;
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return <Pressable style={[styles.primaryButton, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled} accessibilityRole="button">
    {disabled && <ActivityIndicator color="#FFFFFF" />}
    <Text style={styles.primaryButtonText}>{label}</Text>
  </Pressable>;
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.filterSection}><Text style={styles.filterSectionTitle}>{title}</Text><View style={styles.filterPills}>{children}</View></View>;
}

function FilterPill({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable style={[styles.filterPill, selected && styles.filterPillSelected, disabled && styles.filterPillDisabled]} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected, disabled }}>
    <Text style={[styles.filterPillText, selected && styles.filterPillTextSelected, disabled && styles.filterPillTextDisabled]}>{label}</Text>
  </Pressable>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.profileRow}><Text style={styles.profileRowLabel}>{label}</Text><Text style={styles.profileRowValue}>{value}</Text></View>;
}

function BottomTab({ label, icon, selected, disabled, badgeCount = 0, onPress }: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected?: boolean;
  disabled?: boolean;
  badgeCount?: number;
  onPress?: () => void;
}) {
  return <Pressable
    style={styles.bottomTab}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="tab"
    accessibilityLabel={disabled ? `${label}, coming later` : badgeCount > 0 ? `${label}, ${badgeCount} alerts` : label}
    accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
  >
    <View style={styles.bottomTabIcon}>
      <Icon name={icon} size={22} color={selected ? colors.primary : colors.muted} />
      {badgeCount > 0 && <View style={styles.alertBadge}><Text style={styles.alertBadgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text></View>}
    </View>
    <Text style={[styles.bottomTabLabel, selected && styles.bottomTabLabelSelected]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'transparent' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 26 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headingActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headingCopy: { flex: 1 },
  heading: { color: colors.text, fontSize: 32, lineHeight: 39, fontWeight: '800', letterSpacing: -0.8 },
  headingAccent: { color: colors.primary },
  subtitle: { color: colors.muted, fontSize: 15, marginTop: 3 },
  avatarButton: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, backgroundColor: colors.surfaceMuted },
  topFilters: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 },
  iconFilterButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 25, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14, borderRadius: 25, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  pillActiveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  peopleControls: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  roundButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  peopleCount: { minWidth: 24, textAlign: 'center', color: colors.text, fontSize: 21, fontWeight: '700' },
  searchBox: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 17, backgroundColor: colors.surface, paddingHorizontal: 15, marginBottom: 17 },
  searchInput: { flex: 1, minHeight: 49, color: colors.text, fontSize: 15 },
  availabilitySummary: { color: colors.muted, fontSize: 15, marginBottom: 12 },
  offlineBanner: { backgroundColor: '#FFF1D6', borderColor: '#E6C98B', borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  offlineText: { color: '#4D4434', fontSize: 12, lineHeight: 17, flex: 1 },
  summaryEmphasis: { color: colors.text, fontWeight: '800' },
  workerList: { gap: 10 },
  workerCard: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 21, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  workerCardSelected: { borderWidth: 1.5, borderColor: colors.primary },
  avatar: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 28, backgroundColor: colors.surfaceMuted },
  avatarText: { color: colors.text, fontSize: 19, fontWeight: '700' },
  workerCopy: { flex: 1, minWidth: 0, gap: 2 },
  nameAndBadge: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  workerName: { color: colors.text, fontSize: 17, fontWeight: '700' },
  availableBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.successSoft },
  availableBadgeText: { color: colors.success, fontSize: 10, fontWeight: '800' },
  workerMeta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  workerRate: { color: colors.text, fontSize: 14, fontWeight: '600' },
  selectionBox: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#B9C7D9', borderRadius: 7 },
  selectionBoxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectionBoxDisabled: { backgroundColor: colors.surfaceMuted, opacity: 0.6 },
  stickyFooter: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  bottomTabs: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  bottomTab: { minWidth: 62, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bottomTabIcon: { position: 'relative' },
  alertBadge: { position: 'absolute', top: -7, right: -13, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.danger },
  alertBadgeText: { color: '#FFFFFF', fontSize: 10, lineHeight: 13, fontWeight: '800' },
  bottomTabLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  bottomTabLabelSelected: { color: colors.primary },
  alertCountError: { color: colors.danger, fontSize: 12, textAlign: 'center', paddingHorizontal: 12, paddingVertical: 5 },
  primaryButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 18, borderRadius: 30, backgroundColor: colors.primary },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  buttonDisabled: { opacity: 0.62 },
  messageCard: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 22, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface },
  messageText: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20, textAlign: 'center', marginVertical: 8 },
  savedAlertText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  retryText: { color: colors.primary, fontSize: 15, fontWeight: '700', padding: 8 },
  emptyState: { alignItems: 'center', padding: 24, gap: 10 },
  noFreeState: { alignItems: 'center', paddingTop: 23, gap: 11 },
  emptyIcon: { width: 78, height: 78, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.primary, borderRadius: 40, marginBottom: 9 },
  emptyTitle: { color: colors.text, fontSize: 23, lineHeight: 30, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 9 },
  notifyButton: { minHeight: 56, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 30, backgroundColor: colors.text, marginVertical: 5 },
  notifyButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  suggestionsCard: { width: '100%', padding: 16, marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface },
  suggestionRow: { minHeight: 61, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  mutedText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  pageTitleRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  pageTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  monthTitle: { color: colors.text, fontSize: 23, fontWeight: '800' },
  monthControls: { flexDirection: 'row', gap: 10 },
  monthButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  weekday: { width: `${100 / 7}%`, height: 40, color: colors.muted, fontSize: 14, fontWeight: '700', textAlign: 'center', textAlignVertical: 'center' },
  calendarCell: { width: `${100 / 7}%`, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 25 },
  calendarDaySelected: { backgroundColor: colors.primary },
  calendarDayPast: { opacity: 0.42 },
  calendarDayText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  calendarDayTextSelected: { color: '#FFFFFF' },
  calendarDayTextPast: { color: colors.muted },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  summaryCard: { padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface },
  summaryTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  summaryText: { color: colors.muted, fontSize: 15, marginTop: 5 },
  profileHero: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 19 },
  profileAvatar: { width: 94, height: 94, alignItems: 'center', justifyContent: 'center', borderRadius: 47, backgroundColor: colors.surfaceMuted },
  profileAvatarText: { color: colors.text, fontSize: 38, fontWeight: '800' },
  profileHeaderCopy: { flex: 1 },
  profileName: { color: colors.text, fontSize: 25, fontWeight: '800' },
  profileMeta: { color: colors.muted, fontSize: 15, marginTop: 6 },
  statsRow: { flexDirection: 'row', marginBottom: 17 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { color: colors.text, fontSize: 21, fontWeight: '800' },
  statLabel: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 17 },
  outlineChip: { minHeight: 41, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 23, backgroundColor: colors.surface },
  outlineChipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  infoCard: { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface, marginBottom: 22 },
  profileRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  profileRowLabel: { color: colors.muted, fontSize: 15 },
  profileRowValue: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  divider: { height: 1, backgroundColor: colors.border },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800', marginBottom: 11 },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginBottom: 20 },
  weekDay: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface },
  weekDayAvailable: { backgroundColor: colors.primary, borderColor: colors.primary },
  weekDayName: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  weekDayNumber: { color: colors.text, fontSize: 16, fontWeight: '800' },
  weekDayTextAvailable: { color: '#FFFFFF' },
  reviewCard: { padding: 17, marginBottom: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface },
  reviewHeading: { color: colors.text, fontSize: 17, fontWeight: '800' },
  reviewText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  reviewMeta: { color: colors.primary, fontSize: 14, fontWeight: '700', marginTop: 11 },
  lockHint: { color: colors.muted, fontSize: 14, textAlign: 'center', paddingBottom: 12 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 26, 46, 0.5)' },
  filterSheet: { maxHeight: '88%', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 26, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: colors.background },
  filterHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  filterTitle: { color: colors.text, fontSize: 24, fontWeight: '800' },
  resetText: { color: colors.muted, fontSize: 16, fontWeight: '600' },
  filterSection: { marginBottom: 19 },
  filterSectionTitle: { color: colors.muted, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  filterPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  filterPill: { minHeight: 43, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 23, backgroundColor: colors.surface },
  filterPillSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  filterPillDisabled: { opacity: 0.55 },
  filterPillText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  filterPillTextSelected: { color: '#FFFFFF' },
  filterPillTextDisabled: { color: colors.muted },
  workedWithRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 19, backgroundColor: colors.surface },
  workedWithText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  switchTrack: { width: 51, height: 30, justifyContent: 'center', padding: 3, borderRadius: 16, backgroundColor: '#CAD4E1' },
  switchTrackOn: { backgroundColor: colors.primary },
  switchThumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF' },
  switchThumbOn: { alignSelf: 'flex-end' },
});
