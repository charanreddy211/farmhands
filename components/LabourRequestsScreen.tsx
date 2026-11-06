import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from './AppText';
import { Ionicons } from '@expo/vector-icons';
import {
  BookingCancellationReason,
  fetchWorkerRequests,
  fetchBookingDetails,
  BookingDetails,
  cancelBooking,
  RequestDeclineReason,
  respondToRequest,
  WorkerRequest,
  WorkerRequestBucket,
} from '../api/requests';
import { colors } from '../theme';

type Props = {
  workerId: string;
  onBackToHome: () => void;
  onOpenProfile: () => void;
};

const buckets: WorkerRequestBucket[] = ['new', 'accepted', 'past'];
const declineReasons: Array<{ value: RequestDeclineReason; label: string }> = [
  { value: 'already_booked', label: 'Already booked' },
  { value: 'too_far', label: 'Too far' },
  { value: 'pay_too_low', label: 'Pay is too low' },
  { value: 'not_available', label: 'Not available' },
];
const cancellationReasons: Array<{ value: BookingCancellationReason; label: string }> = [
  { value: 'plans_changed', label: 'Plans changed' },
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
  if (remaining <= 0) return 'This request expired';
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  return hours ? `Expires in ${hours} hours` : `Expires in ${minutes} minutes`;
}

export default function LabourRequestsScreen({ workerId, onBackToHome, onOpenProfile }: Props) {
  const [bucket, setBucket] = useState<WorkerRequestBucket>('new');
  const [requests, setRequests] = useState<Record<WorkerRequestBucket, WorkerRequest[]>>({
    new: [],
    accepted: [],
    past: [],
  });
  const [selectedRequest, setSelectedRequest] = useState<WorkerRequest | null>(null);
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState<RequestDeclineReason | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<BookingCancellationReason | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState('');

  async function loadRequests() {
    setLoading(true);
    setError('');
    try {
      const [newRequests, acceptedRequests, pastRequests] = await Promise.all(
        buckets.map((view) => fetchWorkerRequests(workerId, view)),
      );
      setRequests({ new: newRequests, accepted: acceptedRequests, past: pastRequests });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load requests. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRequests();
  }, [workerId]);

  async function openRequestDetails(request: WorkerRequest) {
    setSelectedRequest(request);
    setBookingDetails(null);
    setError('');
    if (request.responseStatus !== 'accepted' || request.bookingStatus !== 'confirmed') return;
    setDetailsLoading(true);
    try {
      setBookingDetails(await fetchBookingDetails(request.request.id, workerId, workerId));
    } catch (detailsError) {
      setError(detailsError instanceof Error ? detailsError.message : 'Could not load booking contact details.');
    } finally {
      setDetailsLoading(false);
    }
  }

  async function callFarmer(request: WorkerRequest) {
    setResponding(true);
    setError('');
    try {
      const details = await fetchBookingDetails(request.request.id, workerId, workerId);
      if (!details.farmer.phone) throw new Error('The farmer phone number is not available.');
      await Linking.openURL(`tel:${details.farmer.phone}`);
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : 'Could not open the phone dialer.');
    } finally {
      setResponding(false);
    }
  }

  async function submitCancellation() {
    if (!selectedRequest || !cancelReason || selectedRequest.bookingStatus !== 'confirmed') return;
    setResponding(true);
    setError('');
    try {
      await cancelBooking(selectedRequest.request.id, workerId, workerId, cancelReason);
      setCancelOpen(false);
      setCancelReason(null);
      setSelectedRequest(null);
      setBookingDetails(null);
      setBucket('past');
      await loadRequests();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Could not cancel this booking.');
    } finally {
      setResponding(false);
    }
  }

  async function openFarmMap() {
    if (!bookingDetails?.farmer.farmMapLink) {
      setError('This farm does not have a saved map pin.');
      return;
    }
    try {
      await Linking.openURL(bookingDetails.farmer.farmMapLink);
    } catch (mapError) {
      setError(mapError instanceof Error ? mapError.message : 'Could not open the farm map.');
    }
  }

  async function submitResponse(status: 'accepted' | 'declined') {
    if (!selectedRequest || (status === 'declined' && !declineReason)) return;
    setResponding(true);
    setError('');
    try {
      await respondToRequest(
        selectedRequest.request.id,
        workerId,
        status,
        status === 'declined' ? declineReason ?? undefined : undefined,
      );
      setSelectedRequest(null);
      setDeclineOpen(false);
      setDeclineReason(null);
      setBucket(status === 'accepted' ? 'accepted' : 'past');
      await loadRequests();
    } catch (responseError) {
      setError(responseError instanceof Error ? responseError.message : 'Could not save your response. Please try again.');
    } finally {
      setResponding(false);
    }
  }

  const activeRequests = requests[bucket];
  const detail = selectedRequest;

  return <View style={styles.page}>
    <View style={styles.header}>
      <Pressable
        style={styles.backButton}
        onPress={detail ? () => setSelectedRequest(null) : onBackToHome}
        accessibilityRole="button"
        accessibilityLabel={detail ? 'Back to requests' : 'Back to worker home'}
      >
        <Icon name="chevron-back" size={22} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.heading}>{detail ? 'Request details' : 'Requests'}</Text>
        <Text style={styles.subtitle}>{detail ? 'పని వివరాలు, మీ సమాధానం.' : 'రైతుల నుండి వచ్చిన పనులు'}</Text>
      </View>
      <Pressable
        style={styles.refreshButton}
        onPress={() => { void loadRequests(); }}
        disabled={loading || responding}
        accessibilityRole="button"
        accessibilityLabel="Refresh requests"
      >
        <Icon name="refresh-outline" color={colors.primary} />
      </Pressable>
    </View>

    {detail ? <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
      <View style={styles.farmerHeader}>
        {detail.farmer?.profileImageUrl
          ? <Image source={{ uri: detail.farmer.profileImageUrl }} style={styles.avatarImage} />
          : <View style={styles.avatar}><Text style={styles.avatarText}>{detail.farmer?.name.charAt(0).toUpperCase() || '?'}</Text></View>}
        <View style={styles.farmerCopy}>
          <Text style={styles.farmerName}>{detail.farmer?.name || 'Farmer profile unavailable'}</Text>
          <Text style={styles.statusText}>{detail.responseStatus === 'pending' ? 'Awaiting your response'
            : detail.responseStatus === 'accepted' ? 'You accepted this request'
              : detail.responseStatus === 'expired' ? 'This request expired'
                : detail.responseStatus === 'cancelled' ? 'This request was cancelled' : 'You declined this request'}</Text>
        </View>
      </View>
      {detailsLoading && <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} /><Text style={styles.helperText}>Loading booking contact…</Text></View>}
      <View style={styles.detailsCard}>
        <DetailRow icon="calendar-outline" label="Dates" value={formatDateRange(detail.request.startDate, detail.request.endDate)} />
        <DetailRow icon="reader-outline" label="Work" value={detail.request.workType} />
        <DetailRow icon="leaf-outline" label="Crop" value={detail.request.crop} />
        <DetailRow icon="people-outline" label="People needed" value={String(detail.request.peopleNeeded)} />
        <DetailRow icon="cash-outline" label="Pay per day" value={`₹${detail.request.payPerDay.toLocaleString('en-IN')}`} />
        <DetailRow icon="location-outline" label="Farm location" value={detail.request.area} last={!bookingDetails?.farmer.phone} />
        {bookingDetails?.farmer.phone && <DetailRow icon="call-outline" label="Farmer phone" value={bookingDetails.farmer.phone} />}
      </View>
      {detail.responseStatus === 'pending' && <View style={styles.detailActions}>
        <PrimaryButton label={responding ? 'Saving…' : 'Accept'} onPress={() => { void submitResponse('accepted'); }} disabled={responding} />
        <SecondaryButton label="Decline" onPress={() => { setDeclineReason(null); setDeclineOpen(true); }} disabled={responding} />
      </View>}
      {detail.responseStatus === 'accepted' && detail.bookingStatus === 'confirmed' && <View style={styles.detailActions}>
        <PrimaryButton label={`Call ${detail.farmer?.name ?? 'farmer'}`} onPress={() => { void callFarmer(detail); }} disabled={responding || !bookingDetails?.farmer.phone} />
        {!!bookingDetails?.farmer.farmMapLink && <SecondaryButton label="Open in Maps" onPress={() => { void openFarmMap(); }} disabled={false} />}
        <SecondaryButton label="Cancel job" onPress={() => { setCancelReason(null); setCancelOpen(true); }} disabled={responding} />
      </View>}
      {detail.responseStatus === 'declined' && detail.declineReason && <Text style={styles.helperText}>
        Reason: {declineReasons.find((reason) => reason.value === detail.declineReason)?.label ?? detail.declineReason}
      </Text>}
      {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
    </ScrollView> : <>
      <View style={styles.tabs} accessibilityRole="tablist">
        {buckets.map((value) => <Pressable
          key={value}
          style={[styles.tab, bucket === value && styles.tabSelected]}
          onPress={() => { setBucket(value); setError(''); }}
          accessibilityRole="tab"
          accessibilityState={{ selected: bucket === value }}
        >
          <Text style={[styles.tabText, bucket === value && styles.tabTextSelected]}>
            {value === 'new' ? 'New' : value === 'accepted' ? 'Accepted' : 'Past'}
          </Text>
          <View style={[styles.countBadge, bucket === value && styles.countBadgeSelected]}>
            <Text style={[styles.countText, bucket === value && styles.countTextSelected]}>{requests[value].length}</Text>
          </View>
        </Pressable>)}
      </View>
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
        {loading ? <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><Text style={styles.emptyText}>Loading requests…</Text></View>
          : activeRequests.length === 0 ? <View style={styles.emptyCard}>
            <Icon name={bucket === 'new' ? 'mail-open-outline' : bucket === 'accepted' ? 'checkmark-circle-outline' : 'time-outline'} size={34} color={colors.primary} />
            <Text style={styles.emptyTitle}>{bucket === 'new' ? 'No new requests' : bucket === 'accepted' ? 'No accepted requests' : 'No past requests'}</Text>
            <Text style={styles.emptyText}>{bucket === 'new' ? 'Requests sent to you by farmers will appear here.' : 'Your request history will appear here.'}</Text>
          </View> : activeRequests.map((item) => <RequestCard
            key={`${item.request.id}-${item.responseStatus}`}
            item={item}
            bucket={bucket}
            onOpen={() => { void openRequestDetails(item); }}
            onAccept={() => { setSelectedRequest(item); setError(''); void respondToSelected(item); }}
            onCall={() => { void callFarmer(item); }}
            onDecline={() => { setSelectedRequest(item); setDeclineReason(null); setDeclineOpen(true); setError(''); }}
            responding={responding}
          />)}
      </ScrollView>
    </>}

    {!!error && detail && <Text style={[styles.errorText, styles.detailError]} accessibilityRole="alert">{error}</Text>}

    {!detail && <View style={styles.bottomBar}>
      <Pressable style={styles.bottomTab} onPress={onBackToHome} accessibilityRole="button">
        <Icon name="home-outline" color={colors.muted} />
        <Text style={styles.bottomTabText}>Home</Text>
      </Pressable>
      <View style={styles.bottomTab} accessibilityRole="tab" accessibilityState={{ selected: true }}>
        <Icon name="notifications-outline" color={colors.primary} />
        <Text style={[styles.bottomTabText, styles.bottomTabSelected]}>Requests</Text>
      </View>
      <Pressable style={styles.bottomTab} onPress={onOpenProfile} accessibilityRole="button">
        <Icon name="person-outline" color={colors.muted} />
        <Text style={styles.bottomTabText}>Profile</Text>
      </Pressable>
    </View>}

    <Modal transparent animationType="slide" visible={declineOpen} onRequestClose={() => setDeclineOpen(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Why are you declining?</Text>
          {declineReasons.map((reason) => <Pressable
            key={reason.value}
            style={[styles.reasonOption, declineReason === reason.value && styles.reasonOptionSelected]}
            onPress={() => setDeclineReason(reason.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: declineReason === reason.value }}
          >
            <Text style={styles.reasonText}>{reason.label}</Text>
            <View style={[styles.radio, declineReason === reason.value && styles.radioSelected]}>
              {declineReason === reason.value && <View style={styles.radioDot} />}
            </View>
          </Pressable>)}
          {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
          <Pressable
            style={[styles.primaryButton, (!declineReason || responding) && styles.buttonDisabled]}
            onPress={() => { void submitResponse('declined'); }}
            disabled={!declineReason || responding}
            accessibilityRole="button"
          >
            {responding && <ActivityIndicator color="#FFFFFF" />}
            <Text style={styles.primaryButtonText}>{responding ? 'Saving…' : 'Decline request'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => setDeclineOpen(false)} accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    <Modal transparent animationType="slide" visible={cancelOpen} onRequestClose={() => setCancelOpen(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Cancel this booking?</Text>
          <Text style={styles.helperText}>This booking will be removed from your upcoming work.</Text>
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
          <Pressable style={[styles.primaryButton, (!cancelReason || responding) && styles.buttonDisabled]} onPress={() => { void submitCancellation(); }} disabled={!cancelReason || responding} accessibilityRole="button">
            {responding && <ActivityIndicator color="#FFFFFF" />}
            <Text style={styles.primaryButtonText}>{responding ? 'Saving…' : 'Yes, cancel'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => setCancelOpen(false)} accessibilityRole="button"><Text style={styles.secondaryButtonText}>Keep booking</Text></Pressable>
        </View>
      </View>
    </Modal>
  </View>;

  async function respondToSelected(item: WorkerRequest) {
    if (responding) return;
    setResponding(true);
    setError('');
    try {
      await respondToRequest(item.request.id, workerId, 'accepted');
      setSelectedRequest(null);
      setBucket('accepted');
      await loadRequests();
    } catch (responseError) {
      setError(responseError instanceof Error ? responseError.message : 'Could not save your response. Please try again.');
    } finally {
      setResponding(false);
    }
  }
}

function RequestCard({ item, bucket, onOpen, onAccept, onCall, onDecline, responding }: {
  item: WorkerRequest;
  bucket: WorkerRequestBucket;
  onOpen: () => void;
  onAccept: () => void;
  onCall: () => void;
  onDecline: () => void;
  responding: boolean;
}) {
  const farmerName = item.farmer?.name || 'Farmer profile unavailable';
  return <View style={styles.requestCard}>
    <Pressable style={styles.cardMain} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`View request from ${farmerName}`}>
      {item.farmer?.profileImageUrl
        ? <Image source={{ uri: item.farmer.profileImageUrl }} style={styles.avatarImage} />
        : <View style={styles.avatar}><Text style={styles.avatarText}>{farmerName.charAt(0).toUpperCase() || '?'}</Text></View>}
      <View style={styles.cardCopy}>
        <Text style={styles.farmerName}>{farmerName}</Text>
        <Text style={styles.cardMeta}>{item.request.workType} · {item.request.crop}</Text>
      </View>
      <Icon name="chevron-forward" color={colors.muted} />
    </Pressable>
    <Text style={styles.requestSummary}>
      {formatDateRange(item.request.startDate, item.request.endDate)} · <Text style={styles.payText}>₹{item.request.payPerDay.toLocaleString('en-IN')}/day</Text>
    </Text>
    {bucket === 'new' && <Text style={styles.helperText}>{countdown(item.expiresAt)}</Text>}
    {bucket === 'new' ? <View style={styles.actionRow}>
      <Pressable style={[styles.acceptButton, responding && styles.buttonDisabled]} onPress={onAccept} disabled={responding} accessibilityRole="button">
        {responding && <ActivityIndicator color="#FFFFFF" />}
        <Text style={styles.acceptButtonText}>{responding ? 'Saving…' : 'Accept'}</Text>
      </Pressable>
      <Pressable style={styles.declineButton} onPress={onDecline} disabled={responding} accessibilityRole="button">
        <Text style={styles.declineButtonText}>Decline</Text>
      </Pressable>
    </View> : item.responseStatus === 'accepted' && item.bookingStatus === 'confirmed'
      ? <View style={styles.actionRow}>
        <Pressable style={[styles.acceptButton, responding && styles.buttonDisabled]} onPress={onCall} disabled={responding} accessibilityRole="button">
          {responding ? <ActivityIndicator color="#FFFFFF" /> : <Icon name="call-outline" color="#FFFFFF" />}
          <Text style={styles.acceptButtonText}>{responding ? 'Opening…' : 'Call farmer'}</Text>
        </Pressable>
        <Pressable style={styles.declineButton} onPress={onOpen} accessibilityRole="button"><Text style={styles.declineButtonText}>Details</Text></Pressable>
      </View>
      : <Text style={styles.responseLabel}>
        {item.responseStatus === 'accepted' ? 'Accepted' : item.responseStatus === 'declined' ? 'Declined'
          : item.responseStatus === 'expired' ? 'Expired' : item.responseStatus === 'cancelled' ? 'Cancelled' : 'Request unavailable'}
      </Text>}
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

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return <Pressable style={[styles.primaryButton, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled} accessibilityRole="button">
    {disabled && <ActivityIndicator color="#FFFFFF" />}
    <Text style={styles.primaryButtonText}>{label}</Text>
  </Pressable>;
}

function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return <Pressable style={[styles.secondaryButton, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled} accessibilityRole="button">
    <Text style={styles.secondaryButtonText}>{label}</Text>
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
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, paddingHorizontal: 12, backgroundColor: 'transparent' },
  tab: { minHeight: 56, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabSelected: { borderBottomColor: colors.primary },
  tabText: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  tabTextSelected: { color: colors.text, fontWeight: '700' },
  countBadge: { minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderRadius: 12, backgroundColor: colors.border },
  countBadgeSelected: { backgroundColor: colors.primarySoft },
  countText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  countTextSelected: { color: colors.primary },
  listContent: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 16, padding: 20, paddingBottom: 28 },
  loadingState: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyCard: { alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingVertical: 36, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  requestCard: { padding: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  cardMain: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 28, backgroundColor: colors.surfaceMuted },
  avatarImage: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceMuted },
  avatarText: { color: colors.text, fontSize: 23, fontWeight: '700' },
  cardCopy: { flex: 1 },
  farmerCopy: { flex: 1 },
  farmerName: { color: colors.text, fontSize: 19, lineHeight: 25, fontWeight: '700' },
  cardMeta: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  requestSummary: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 14, marginBottom: 14 },
  payText: { color: colors.text, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 12 },
  acceptButton: { minHeight: 54, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 28, backgroundColor: colors.text },
  acceptButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  declineButton: { minHeight: 54, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 28, backgroundColor: colors.surface },
  declineButtonText: { color: colors.text, fontSize: 17, fontWeight: '600' },
  responseLabel: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  helperText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  detailContent: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 18, padding: 20, paddingBottom: 32 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailActions: { gap: 10, marginTop: 4 },
  farmerHeader: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 14 },
  statusText: { color: colors.muted, fontSize: 15, marginTop: 3 },
  detailsCard: { paddingHorizontal: 16, paddingVertical: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  detailRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { flex: 1, color: colors.muted, fontSize: 16 },
  detailValue: { maxWidth: '60%', color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20, paddingVertical: 6 },
  detailError: { marginHorizontal: 20 },
  bottomBar: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  bottomTab: { minWidth: 76, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
  bottomTabText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  bottomTabSelected: { color: colors.primary },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 26, 46, 0.48)' },
  modalSheet: { gap: 12, padding: 20, paddingBottom: 30, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.background },
  modalTitle: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: '800', marginBottom: 4 },
  reasonOption: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface },
  reasonOptionSelected: { borderWidth: 2, borderColor: colors.primary },
  reasonText: { color: colors.text, fontSize: 17, fontWeight: '600' },
  radio: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#CBD5E1', borderRadius: 14 },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primary },
  primaryButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2, borderRadius: 30, backgroundColor: colors.primary },
  primaryButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  buttonDisabled: { opacity: 0.65 },
  secondaryButton: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 28, backgroundColor: colors.surface },
  secondaryButtonText: { color: colors.text, fontSize: 17, fontWeight: '600' },
});
