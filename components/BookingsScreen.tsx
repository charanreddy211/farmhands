import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from './AppText';
import { Ionicons } from '@expo/vector-icons';
import {
  BookingBucket,
  BookingCancellationReason,
  BookingDetails,
  BookingListItem,
  cancelBooking,
  cancelRequest,
  fetchBookingDetails,
  fetchBookings,
  repeatRequest,
} from '../api/requests';
import { BookingWorkerReview, fetchBookingWorkerReview } from '../api/workers';
import RateWorkerScreen from './RateWorkerScreen';
import { colors } from '../theme';

type Props = {
  farmerId: string;
  alertCount: number;
  alertCountError: string;
  initialBucket?: BookingBucket;
  onFindWorkers: () => void;
  onOpenAlerts: () => void;
  onOpenProfile: () => void;
};

const buckets: BookingBucket[] = ['upcoming', 'pending', 'past'];
const cancellationReasons: Array<{ value: BookingCancellationReason; label: string }> = [
  { value: 'plans_changed', label: 'Plans changed' },
  { value: 'found_another_worker', label: 'Found another worker' },
  { value: 'dates_changed', label: 'Dates changed' },
  { value: 'other', label: 'Other' },
];

function Icon({ name, size = 20, color = colors.text }: {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

function formatDate(value: string, includeYear = false): string {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
}

function formatDateRange(start: string, end: string): string {
  return start === end
    ? formatDate(start, true)
    : `${formatDate(start)} – ${formatDate(end, true)}`;
}

function countdown(expiresAt: string): string {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return 'Reply deadline passed';
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  return hours ? `Reply due in ${hours}h` : `Reply due in ${minutes}m`;
}

export default function BookingsScreen({ farmerId, alertCount, alertCountError, initialBucket = 'upcoming', onFindWorkers, onOpenAlerts, onOpenProfile }: Props) {
  const [bucket, setBucket] = useState<BookingBucket>(initialBucket);
  const [items, setItems] = useState<Record<BookingBucket, BookingListItem[]>>({
    upcoming: [],
    pending: [],
    past: [],
  });
  const [selectedItem, setSelectedItem] = useState<BookingListItem | null>(null);
  const [detail, setDetail] = useState<BookingDetails | null>(null);
  const [workerReview, setWorkerReview] = useState<BookingWorkerReview | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<BookingCancellationReason | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const refreshInProgress = useRef(false);

  const loadBookings = useCallback(async (showLoading = true) => {
    if (refreshInProgress.current) return;
    refreshInProgress.current = true;
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [upcoming, pending, past] = await Promise.all(
        buckets.map((view) => fetchBookings(farmerId, 'farmer', view)),
      );
      setItems({ upcoming, pending, past });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load bookings. Please try again.');
    } finally {
      if (showLoading) setLoading(false);
      refreshInProgress.current = false;
    }
  }, [farmerId]);

  useEffect(() => {
    void loadBookings();
    const refreshInterval = setInterval(() => {
      if (AppState.currentState === 'active') void loadBookings(false);
    }, 10000);
    return () => clearInterval(refreshInterval);
  }, [loadBookings]);

  async function openItem(item: BookingListItem) {
    setSelectedItem(item);
    setDetail(null);
    setWorkerReview(null);
    setRatingSubmitted(false);
    setError('');
    if (item.type !== 'booking' || !item.booking) return;
    setDetailLoading(true);
    try {
      const [bookingDetails, ratingState] = await Promise.all([
        fetchBookingDetails(item.request.id, item.booking.workerId, farmerId),
        item.booking.status === 'completed'
          ? fetchBookingWorkerReview(item.request.id, item.booking.workerId, farmerId)
          : Promise.resolve(null),
      ]);
      setDetail(bookingDetails);
      setWorkerReview(ratingState);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load booking details.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function callWorker(item: BookingListItem) {
    if (!item.booking) return;
    setSaving(true);
    setError('');
    try {
      const booking = await fetchBookingDetails(item.request.id, item.booking.workerId, farmerId);
      if (!booking.worker.phone) throw new Error('The worker phone number is not available.');
      await Linking.openURL(`tel:${booking.worker.phone}`);
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : 'Could not open the phone dialer.');
    } finally {
      setSaving(false);
    }
  }

  async function submitCancellation() {
    if (!selectedItem || !cancelReason) return;
    setSaving(true);
    setError('');
    try {
      if (selectedItem.type === 'booking' && selectedItem.booking) {
        await cancelBooking(selectedItem.request.id, selectedItem.booking.workerId, farmerId, cancelReason);
      } else {
        await cancelRequest(selectedItem.request.id, farmerId, cancelReason);
      }
      setCancelOpen(false);
      setCancelReason(null);
      setSelectedItem(null);
      setDetail(null);
      await loadBookings();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Could not cancel this booking.');
    } finally {
      setSaving(false);
    }
  }

  async function sendAgain(item: BookingListItem) {
    if (!item.worker) return;
    setSaving(true);
    setError('');
    try {
      await repeatRequest(item.request.id, farmerId, item.worker.id);
      setSelectedItem(null);
      await loadBookings();
      setBucket('pending');
    } catch (repeatError) {
      setError(repeatError instanceof Error ? repeatError.message : 'Could not send this request again.');
    } finally {
      setSaving(false);
    }
  }

  async function openFarmMap() {
    const mapLink = detail?.farmer.farmMapLink;
    if (!mapLink) {
      setError('This farm does not have a saved map pin.');
      return;
    }
    try {
      await Linking.openURL(mapLink);
    } catch (mapError) {
      setError(mapError instanceof Error ? mapError.message : 'Could not open the farm map.');
    }
  }

  const selectedName = selectedItem?.worker?.name ?? 'worker';
  const selectedRequest = selectedItem?.request;
  const selectedType = selectedItem?.type;
  const durationDays = selectedRequest
    ? Math.max(1, Math.round(
      (new Date(`${selectedRequest.endDate}T00:00:00`).getTime()
        - new Date(`${selectedRequest.startDate}T00:00:00`).getTime()) / 86400000,
    ) + 1)
    : 0;
  const totalCost = selectedRequest
    ? selectedRequest.peopleNeeded * durationDays * selectedRequest.payPerDay
    : 0;

  if (ratingOpen && selectedItem?.booking && detail) {
    return <RateWorkerScreen
      requestId={selectedItem.request.id}
      workerId={selectedItem.booking.workerId}
      farmerId={farmerId}
      workerName={detail.worker.name}
      workerImageUrl={detail.worker.profileImageUrl}
      requestTitle={selectedItem.request.workType}
      startDate={selectedItem.request.startDate}
      endDate={selectedItem.request.endDate}
      peopleNeeded={selectedItem.booking.peopleCount ?? selectedItem.request.peopleNeeded}
      onBack={() => setRatingOpen(false)}
      onSubmitted={() => {
        setRatingOpen(false);
        setRatingSubmitted(true);
        setWorkerReview((current) => current ? { ...current, canRate: false } : current);
        void loadBookings();
      }}
    />;
  }

  return <View style={styles.page}>
    <View style={styles.header}>
      <Pressable
        style={styles.backButton}
        onPress={selectedItem ? () => { setSelectedItem(null); setDetail(null); setError(''); } : onFindWorkers}
        accessibilityRole="button"
        accessibilityLabel={selectedItem ? 'Back to bookings' : 'Find workers'}
      >
        <Icon name="chevron-back" size={22} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.heading}>{selectedItem?.type === 'expired' ? 'Request expired' : selectedItem ? 'Booking details' : 'Bookings'}</Text>
        <Text style={styles.subtitle}>{selectedItem ? 'Dates, work details, and contact.' : 'మీ బుకింగ్‌లు'}</Text>
      </View>
      {!selectedItem && <Pressable
        style={styles.refreshButton}
        onPress={() => { void loadBookings(); }}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Refresh bookings"
      >
        <Icon name="refresh-outline" color={colors.primary} />
      </Pressable>}
    </View>

    {!selectedItem ? <>
      <View style={styles.tabs} accessibilityRole="tablist">
        {buckets.map((value) => <Pressable
          key={value}
          style={[styles.tab, bucket === value && styles.tabSelected]}
          onPress={() => { setBucket(value); setError(''); }}
          accessibilityRole="tab"
          accessibilityState={{ selected: bucket === value }}
        >
          <Text style={[styles.tabText, bucket === value && styles.tabTextSelected]}>
            {value === 'upcoming' ? 'Upcoming' : value === 'pending' ? 'Pending' : 'Past'}
          </Text>
          <Text style={[styles.tabCount, bucket === value && styles.tabTextSelected]}>{items[value].length}</Text>
        </Pressable>)}
      </View>
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
        {loading ? <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><Text style={styles.emptyText}>Loading bookings…</Text></View>
          : items[bucket].length === 0 ? <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><Icon name={bucket === 'past' ? 'time-outline' : 'reader-outline'} size={38} color={colors.primary} /></View>
            <Text style={styles.emptyTitle}>{bucket === 'upcoming' ? 'No bookings yet' : bucket === 'pending' ? 'No pending replies' : 'No past bookings'}</Text>
            <Text style={styles.emptyText}>{bucket === 'upcoming' ? 'Find free workers for your dates and send a request.' : bucket === 'pending' ? 'Requests waiting for a worker reply will appear here.' : 'Completed, cancelled, and expired work will appear here.'}</Text>
            {bucket === 'upcoming' && <PrimaryButton label="Find workers" onPress={onFindWorkers} disabled={false} />}
          </View> : items[bucket].map((item) => <BookingCard
            key={`${item.request.id}-${item.booking?.workerId ?? item.worker?.id ?? item.type}`}
            item={item}
            bucket={bucket}
            onOpen={() => { void openItem(item); }}
            onCall={() => { void callWorker(item); }}
            onCancel={() => { setSelectedItem(item); setCancelReason(null); setCancelOpen(true); setError(''); }}
            responding={saving}
          />)}
      </ScrollView>
      {!!alertCountError && <Text style={styles.alertCountError} accessibilityRole="alert">{alertCountError}</Text>}
      <View style={styles.bottomBar}>
        <Pressable style={styles.bottomTab} onPress={onFindWorkers} accessibilityRole="button">
          <Icon name="search-outline" color={colors.muted} /><Text style={styles.bottomTabText}>Find</Text>
        </Pressable>
        <View style={styles.bottomTab} accessibilityRole="tab" accessibilityState={{ selected: true }}>
          <Icon name="reader-outline" color={colors.primary} /><Text style={[styles.bottomTabText, styles.bottomTabSelected]}>Bookings</Text>
        </View>
        <Pressable
          style={styles.bottomTab}
          onPress={onOpenAlerts}
          accessibilityRole="button"
          accessibilityLabel={alertCount > 0 ? `Alerts, ${alertCount} notifications` : 'Alerts'}
        >
          <View style={styles.bottomTabIcon}>
            <Icon name="notifications-outline" color={colors.muted} />
            {alertCount > 0 && <View style={styles.alertBadge}><Text style={styles.alertBadgeText}>{alertCount > 99 ? '99+' : alertCount}</Text></View>}
          </View>
          <Text style={styles.bottomTabText}>Alerts</Text>
        </Pressable>
        <Pressable style={styles.bottomTab} onPress={onOpenProfile} accessibilityRole="button">
          <Icon name="person-outline" color={colors.muted} /><Text style={styles.bottomTabText}>Profile</Text>
        </Pressable>
      </View>
    </> : <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
      {selectedType === 'expired' ? <View style={styles.expiredHero}>
        <View style={styles.expiredIcon}><Icon name="time-outline" size={38} color={colors.warning} /></View>
        <Text style={styles.expiredTitle}>{selectedName} did not reply</Text>
        <Text style={styles.expiredCopy}>The request expired after 6 hours. Nothing was charged.</Text>
      </View> : <View style={styles.personCard}>
        {selectedItem.worker?.profileImageUrl
          ? <Image source={{ uri: selectedItem.worker.profileImageUrl }} style={styles.avatarImage} />
          : <View style={styles.avatar}><Text style={styles.avatarText}>{selectedName.charAt(0).toUpperCase() || '?'}</Text></View>}
        <View style={styles.personCopy}>
          <Text style={styles.personName}>{selectedName}</Text>
          <Text style={styles.personMeta}>{selectedItem.type === 'booking' ? (selectedItem.booking?.status ?? 'confirmed').toUpperCase() : 'WAITING FOR REPLY'}</Text>
        </View>
      </View>}

      {detailLoading ? <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><Text style={styles.emptyText}>Loading contact and farm details…</Text></View>
        : <View style={styles.detailsCard}>
          <DetailRow icon="calendar-outline" label="Dates" value={selectedRequest ? formatDateRange(selectedRequest.startDate, selectedRequest.endDate) : ''} />
          <DetailRow icon="reader-outline" label="Work" value={selectedRequest?.workType ?? ''} />
          <DetailRow icon="leaf-outline" label="Crop" value={selectedRequest?.crop ?? ''} />
          <DetailRow icon="location-outline" label="Farm" value={selectedRequest?.area ?? ''} />
          <DetailRow icon="people-outline" label="People" value={String(selectedRequest?.peopleNeeded ?? 0)} />
          <DetailRow icon="cash-outline" label="Pay" value={`₹${selectedRequest?.payPerDay.toLocaleString('en-IN') ?? 0} / day`} last={!detail?.worker.phone} />
          {detail?.worker.phone && detail.booking.status !== 'cancelled' && <DetailRow icon="call-outline" label="Worker mobile" value={detail.worker.phone} last />}
        </View>}

      {selectedType === 'request' && selectedItem.expiresAt && <Text style={styles.helperText}>{countdown(selectedItem.expiresAt)} · Phone numbers are shared after a worker accepts.</Text>}
      {selectedType === 'booking' && detail && <View style={styles.costCard}>
        <Text style={styles.costFormula}>{selectedRequest?.peopleNeeded} people × {durationDays} days × ₹{selectedRequest?.payPerDay}</Text>
        <Text style={styles.costTotal}>₹{totalCost.toLocaleString('en-IN')}</Text>
        <Text style={styles.helperText}>Payment is arranged directly with workers.</Text>
      </View>}

      {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
      <View style={styles.detailActions}>
        {selectedType === 'booking' && detail && <PrimaryButton
          label={`Call ${detail.worker.name}`}
          icon="call-outline"
          onPress={() => { void callWorker(selectedItem); }}
          disabled={!detail.worker.phone || detail.booking.status === 'cancelled'}
        />}
        {selectedType === 'booking' && detail?.farmer.farmMapLink && <SecondaryButton label="Open in Maps" icon="location-outline" onPress={() => { void openFarmMap(); }} />}
        {selectedType === 'booking' && detail?.booking.status === 'completed' && workerReview?.canRate
          && !workerReview.review && !ratingSubmitted && <PrimaryButton
            label="Rate worker"
            icon="star-outline"
            onPress={() => setRatingOpen(true)}
            disabled={detailLoading}
          />}
        {selectedType === 'booking' && detail?.booking.status === 'completed' && (workerReview?.review || ratingSubmitted)
          && <Text style={styles.helperText}>You rated this booking. Thank you for sharing your experience.</Text>}
        {(selectedType === 'booking' && detail?.booking.status === 'confirmed') && <SecondaryButton
          label="Cancel booking"
          danger
          onPress={() => { setCancelReason(null); setCancelOpen(true); }}
        />}
        {selectedType === 'request' && <SecondaryButton
          label="Cancel request"
          onPress={() => { setCancelReason(null); setCancelOpen(true); }}
        />}
        {selectedType === 'expired' && <PrimaryButton label="Find another worker" onPress={onFindWorkers} disabled={false} />}
        {selectedType === 'expired' && <SecondaryButton
          label={`Send again to ${selectedName}`}
          onPress={() => { void sendAgain(selectedItem); }}
          disabled={saving}
        />}
      </View>
    </ScrollView>}

    <Modal transparent animationType="slide" visible={cancelOpen} onRequestClose={() => setCancelOpen(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>{selectedItem?.type === 'booking' ? 'Cancel this booking?' : 'Cancel this request?'}</Text>
          <Text style={styles.modalCopy}>The other person will be told right away. Please choose a reason.</Text>
          {cancellationReasons.map((reason) => <Pressable
            key={reason.value}
            style={[styles.reasonOption, cancelReason === reason.value && styles.reasonOptionSelected]}
            onPress={() => setCancelReason(reason.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: cancelReason === reason.value }}
          >
            <Text style={styles.reasonText}>{reason.label}</Text>
            <View style={[styles.radio, cancelReason === reason.value && styles.radioSelected]}>{cancelReason === reason.value && <View style={styles.radioDot} />}</View>
          </Pressable>)}
          {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
          <PrimaryButton
            label={saving ? 'Saving…' : 'Yes, cancel'}
            onPress={() => { void submitCancellation(); }}
            disabled={!cancelReason || saving}
          />
          <SecondaryButton label="Keep booking" onPress={() => setCancelOpen(false)} />
        </View>
      </View>
    </Modal>
  </View>;
}

function BookingCard({ item, bucket, onOpen, onCall, onCancel, responding }: {
  item: BookingListItem;
  bucket: BookingBucket;
  onOpen: () => void;
  onCall: () => void;
  onCancel: () => void;
  responding: boolean;
}) {
  const name = item.worker?.name || 'Worker profile unavailable';
  const badge = item.type === 'expired' ? 'EXPIRED'
    : item.booking?.status === 'cancelled' ? 'CANCELLED'
      : item.booking?.status === 'completed' ? 'DONE'
        : bucket === 'pending' ? 'WAITING'
          : item.booking?.status === 'confirmed' ? 'CONFIRMED' : item.responseStatus.toUpperCase();
  return <View style={styles.bookingCard}>
    <Pressable style={styles.cardMain} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`View ${badge.toLowerCase()} booking with ${name}`}>
      {item.worker?.profileImageUrl
        ? <Image source={{ uri: item.worker.profileImageUrl }} style={styles.avatarImage} />
        : <View style={styles.avatar}><Text style={styles.avatarText}>{name.charAt(0).toUpperCase() || '?'}</Text></View>}
      <View style={styles.cardCopy}>
        <View style={styles.nameAndBadge}><Text style={styles.personName}>{name}</Text><View style={[styles.statusBadge, bucket === 'pending' && styles.pendingBadge]}><Text style={[styles.statusText, bucket === 'pending' && styles.pendingText]}>{badge}</Text></View></View>
        <Text style={styles.cardMeta}>{item.request.workType} · {item.request.crop}</Text>
        <Text style={styles.cardMeta}>{formatDateRange(item.request.startDate, item.request.endDate)} · {item.request.peopleNeeded} people</Text>
      </View>
    </Pressable>
    <Text style={styles.payLine}>₹{item.request.payPerDay.toLocaleString('en-IN')} / day</Text>
    {bucket === 'pending' && item.expiresAt && <Text style={styles.deadlineText}><Icon name="time-outline" size={15} color={colors.muted} /> {countdown(item.expiresAt)}</Text>}
    {bucket === 'upcoming' && item.booking?.status === 'confirmed' && <View style={styles.actionRow}>
      <Pressable style={[styles.callButton, responding && styles.disabled]} onPress={onCall} disabled={responding} accessibilityRole="button">
        <Icon name="call-outline" size={18} color="#FFFFFF" /><Text style={styles.callButtonText}>Call</Text>
      </Pressable>
      <Pressable style={styles.detailsButton} onPress={onOpen} accessibilityRole="button"><Text style={styles.detailsButtonText}>Details</Text></Pressable>
    </View>}
    {bucket === 'pending' && <Pressable style={styles.detailsButton} onPress={onCancel} accessibilityRole="button"><Text style={styles.detailsButtonText}>Cancel request</Text></Pressable>}
    {bucket === 'past' && item.type !== 'expired' && <Pressable style={styles.detailsButton} onPress={onOpen} accessibilityRole="button"><Text style={styles.detailsButtonText}>Details</Text></Pressable>}
    {bucket === 'past' && item.type === 'expired' && <Text style={styles.deadlineText}>This worker did not reply before the deadline.</Text>}
  </View>;
}

function DetailRow({ icon, label, value, last = false }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return <View style={[styles.detailRow, last && styles.detailRowLast]}>
    <Icon name={icon} color={colors.text} />
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>;
}

function PrimaryButton({ label, icon, onPress, disabled }: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled: boolean;
}) {
  return <Pressable style={[styles.primaryButton, disabled && styles.disabled]} onPress={onPress} disabled={disabled} accessibilityRole="button">
    {icon && <Icon name={icon} color="#FFFFFF" />}
    <Text style={styles.primaryButtonText}>{label}</Text>
  </Pressable>;
}

function SecondaryButton({ label, icon, danger, onPress, disabled = false }: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return <Pressable style={[styles.secondaryButton, disabled && styles.disabled]} onPress={onPress} disabled={disabled} accessibilityRole="button">
    {icon && <Icon name={icon} color={danger ? colors.danger : colors.text} />}
    <Text style={[styles.secondaryButtonText, danger && styles.dangerText]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, backgroundColor: 'transparent' },
  backButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  headerCopy: { flex: 1 },
  heading: { color: colors.primary, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 22, marginTop: 2 },
  refreshButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.surface },
  tabs: { flexDirection: 'row', paddingHorizontal: 8, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
  tab: { minHeight: 58, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabSelected: { borderBottomColor: colors.primary },
  tabText: { color: colors.muted, fontSize: 15 },
  tabTextSelected: { color: colors.text, fontWeight: '700' },
  tabCount: { color: colors.muted, fontSize: 14 },
  listContent: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 16, padding: 20, paddingBottom: 28 },
  loadingState: { minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyState: { flex: 1, minHeight: 430, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  emptyIcon: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center', borderRadius: 56, backgroundColor: colors.primarySoft },
  emptyTitle: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  bookingCard: { gap: 14, padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 28, backgroundColor: colors.surfaceMuted },
  avatarImage: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceMuted },
  avatarText: { color: colors.text, fontSize: 23, fontWeight: '700' },
  cardCopy: { flex: 1, gap: 3 },
  nameAndBadge: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  personName: { color: colors.text, fontSize: 19, lineHeight: 25, fontWeight: '700' },
  personMeta: { color: colors.muted, fontSize: 15 },
  cardMeta: { color: colors.muted, fontSize: 14, lineHeight: 19 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.successSoft },
  statusText: { color: colors.success, fontSize: 11, fontWeight: '800' },
  pendingBadge: { backgroundColor: colors.warningSoft },
  pendingText: { color: colors.warning },
  payLine: { color: colors.text, fontSize: 16, fontWeight: '700' },
  deadlineText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 10 },
  callButton: { minHeight: 52, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 28, backgroundColor: colors.text },
  callButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  detailsButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 25, backgroundColor: colors.surface },
  detailsButtonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  detailContent: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 16, padding: 20, paddingBottom: 34 },
  personCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  personCopy: { flex: 1, gap: 5 },
  detailsCard: { paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  detailRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { flex: 1, color: colors.muted, fontSize: 16 },
  detailValue: { maxWidth: '60%', color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  costCard: { padding: 18, borderRadius: 22, backgroundColor: colors.primarySoft },
  costFormula: { color: colors.muted, fontSize: 16 },
  costTotal: { color: colors.text, fontSize: 29, fontWeight: '800', marginTop: 4 },
  helperText: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  detailActions: { gap: 12, marginTop: 8 },
  primaryButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 18, borderRadius: 30, backgroundColor: colors.text },
  primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  secondaryButton: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 28, backgroundColor: colors.surface },
  secondaryButtonText: { color: colors.text, fontSize: 17, fontWeight: '600' },
  dangerText: { color: colors.danger },
  expiredHero: { alignItems: 'center', gap: 14, paddingTop: 24, paddingBottom: 4 },
  expiredIcon: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center', borderRadius: 56, backgroundColor: colors.warningSoft },
  expiredTitle: { color: colors.text, fontSize: 27, lineHeight: 34, fontWeight: '800', textAlign: 'center' },
  expiredCopy: { color: colors.muted, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  bottomBar: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  bottomTab: { minWidth: 76, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
  bottomTabIcon: { position: 'relative' },
  alertBadge: { position: 'absolute', top: -7, right: -13, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.danger },
  alertBadgeText: { color: '#FFFFFF', fontSize: 10, lineHeight: 13, fontWeight: '800' },
  bottomTabText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  alertCountError: { color: colors.danger, fontSize: 12, textAlign: 'center', paddingHorizontal: 12, paddingVertical: 5 },
  bottomTabSelected: { color: colors.primary },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 26, 46, 0.48)' },
  modalSheet: { gap: 12, padding: 20, paddingBottom: 30, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.background },
  modalTitle: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: '800' },
  modalCopy: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 4 },
  reasonOption: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface },
  reasonOptionSelected: { borderWidth: 2, borderColor: colors.primary },
  reasonText: { color: colors.text, fontSize: 17, fontWeight: '600' },
  radio: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#CBD5E1', borderRadius: 14 },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primary },
  disabled: { opacity: 0.6 },
});
