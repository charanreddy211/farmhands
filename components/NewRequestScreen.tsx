import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from './AppText';
import AppTextInput from './AppTextInput';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { CreateRequestInput, fetchRequestOptions, LabourRequest, RequestOptions, uploadRequestImage } from '../api/requests';
import type { WorkerProfile } from '../api/workers';
import type { UserProfile } from '../api/profile';
import { colors } from '../theme';

type Step = 'work' | 'schedule' | 'review' | 'sent';
type DateField = 'start' | 'end';
type Props = {
  farmerId: string;
  profile: UserProfile;
  selectedWorkers: WorkerProfile[];
  initialDates: { from: string; to: string } | null;
  initialPeopleNeeded: number;
  onViewRequests: () => void;
  onBackToSearch: () => void;
  onPublish: (input: CreateRequestInput) => Promise<LabourRequest>;
};

function dateInputValue(date: Date | null): string {
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';
}

function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function dateLabel(date: Date | null): string {
  return date ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Choose date';
}

function dateRangeLabel(start: string, end: string): string {
  const format = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return start === end ? format(start) : `${format(start)} – ${format(end)}`;
}

function daysBetween(start: Date, end: Date): number {
  return Math.floor((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000) + 1;
}

function Icon({ name, size = 20, color = colors.text }: { name: keyof typeof Ionicons.glyphMap; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function NewRequestScreen({ farmerId, profile, selectedWorkers, initialDates, initialPeopleNeeded, onViewRequests, onBackToSearch, onPublish }: Props) {
  const [step, setStep] = useState<Step>('work');
  const [options, setOptions] = useState<RequestOptions>({ workTypes: [], crops: [], farms: [] });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [workType, setWorkType] = useState('');
  const [crop, setCrop] = useState('');
  const [area, setArea] = useState(profile.farms[0]?.address ?? profile.homeAddress);
  const [farmLocationId, setFarmLocationId] = useState<string | null>(profile.farms[0]?.id ?? null);
  const selectedCapacity = selectedWorkers.reduce((total, worker) => total + (worker.groupSize ?? 1), 0);
  const [people, setPeople] = useState(String(Math.max(initialPeopleNeeded, 1)));
  const [pay, setPay] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(parseDateInput(initialDates?.from ?? ''));
  const [endDate, setEndDate] = useState<Date | null>(parseDateInput(initialDates?.to ?? ''));
  const [activeDateField, setActiveDateField] = useState<DateField | null>(null);
  const [dateDraft, setDateDraft] = useState(new Date());
  const [requestImage, setRequestImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdRequest, setCreatedRequest] = useState<LabourRequest | null>(null);

  useEffect(() => {
    let active = true;
    setOptionsLoading(true);
    setOptionsError('');
    fetchRequestOptions(farmerId)
      .then((response) => {
        if (!active) return;
        setOptions(response);
        setCrop((current) => current || response.crops[0] || '');
      })
      .catch((loadError) => {
        if (active) setOptionsError(loadError instanceof Error ? loadError.message : 'Could not load work and crop options.');
      })
      .finally(() => { if (active) setOptionsLoading(false); });
    return () => { active = false; };
  }, [farmerId]);

  const selectedDays = startDate && endDate ? daysBetween(startDate, endDate) : 0;
  const peopleNeeded = Number(people);
  const payPerDay = Number(pay);
  const estimatedTotal = peopleNeeded * selectedDays * payPerDay;

  function setRequestDate(field: DateField, date: Date | null) {
    setError('');
    if (field === 'start') {
      setStartDate(date);
      if (date && endDate && endDate < date) setEndDate(date);
    } else {
      setEndDate(date);
    }
  }

  function openDatePicker(field: DateField) {
    const value = field === 'start' ? startDate : endDate;
    const initialDate = value ?? (field === 'end' ? startDate : null) ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initialDate,
        mode: 'date',
        minimumDate: field === 'end' ? startDate ?? undefined : new Date(),
        maximumDate: field === 'start' ? endDate ?? undefined : undefined,
        onChange: (event, selectedDate) => {
          if (event.type === 'set' && selectedDate) setRequestDate(field, selectedDate);
        },
      });
      return;
    }
    setDateDraft(initialDate);
    setActiveDateField(field);
  }

  async function chooseImage() {
    setError('');
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError('Allow photo library access to add a crop photo.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled) setRequestImage(result.assets[0]);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : 'Could not open your photo library.');
    }
  }

  function continueToSchedule() {
    if (!workType.trim() || !crop.trim() || !area.trim()) {
      setError('Add the work, crop, and farm location to continue.');
      return;
    }
    if (workType.trim().length > 80 || crop.trim().length > 80 || area.trim().length > 160) {
      setError('Work and crop names must be under 80 characters and location under 160.');
      return;
    }
    if (workType.trim().length + crop.trim().length + 1 > 160) {
      setError('The combined work and crop title must be 160 characters or fewer.');
      return;
    }
    setError('');
    setStep('schedule');
  }

  function continueToReview() {
    const count = Number(people);
    const rate = Number(pay);
    if (!startDate) {
      setError('Choose a start date for the job.');
      return;
    }
    if (!endDate) {
      setError('Choose an end date for the job.');
      return;
    }
    if (endDate < startDate) {
      setError('The end date must be on or after the start date.');
      return;
    }
    if (!people.trim()) {
      setError('Enter how many people you need.');
      return;
    }
    if (!Number.isInteger(count)) {
      setError('People needed must be a whole number.');
      return;
    }
    if (count < 1 || count > 100) {
      setError('People needed must be between 1 and 100.');
      return;
    }
    if (!pay.trim()) {
      setError('Enter the daily pay per worker.');
      return;
    }
    if (!Number.isInteger(rate)) {
      setError('Daily pay must be a whole number of rupees.');
      return;
    }
    if (rate < 1 || rate > 100000) {
      setError('Daily pay must be between ₹1 and ₹100,000 per worker.');
      return;
    }
    const workerCapacity = selectedWorkers.reduce((total, worker) => total + (worker.groupSize ?? 1), 0);
    if (workerCapacity < count) {
      setError('Select enough workers or groups to cover the number of people needed before continuing.');
      return;
    }
    if (selectedDays > 31) {
      setError('A request can cover a maximum of 31 days.');
      return;
    }
    setError('');
    setStep('review');
  }

  async function submitRequest() {
    if (!startDate || !endDate) return;
    setSubmitting(true);
    setError('');
    try {
      const work = workType.trim();
      const selectedCrop = crop.trim();
      const imageUrl = requestImage ? await uploadRequestImage(requestImage) : null;
      const saved = await onPublish({
        title: `${selectedCrop} ${work}`,
        workType: work,
        crop: selectedCrop,
        farmLocationId,
        area: area.trim(),
        startDate: dateInputValue(startDate),
        endDate: dateInputValue(endDate),
        peopleNeeded,
        payPerDay,
        farmerId,
        workerIds: selectedWorkers.map((worker) => worker.id),
        imageUrl,
      });
      setCreatedRequest(saved);
      setStep('sent');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save your request. Check the connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const title = step === 'work' ? 'Work details'
    : step === 'schedule' ? 'Dates and people'
      : step === 'review' ? 'Review request'
        : 'Request saved';

  if (step === 'sent' && createdRequest) {
    return <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.successContent}>
        <View style={styles.successIcon}><Icon name="checkmark" size={44} color={colors.success} /></View>
        <Text style={styles.successTitle}>Request saved</Text>
        <Text style={styles.successSubtitle}>Your request is now recorded. Worker response and alert delivery will be available in a later step.</Text>
        <View style={styles.summaryCard}>
          {selectedWorkers.map((worker) => <SummaryRow key={worker.id} icon="person-outline" label={worker.name} value="Selected" />)}
          <SummaryRow icon="calendar-outline" label="Dates" value={dateRangeLabel(createdRequest.startDate, createdRequest.endDate)} />
          <SummaryRow icon="reader-outline" label="Work" value={createdRequest.workType} />
          <SummaryRow icon="leaf-outline" label="Crop" value={createdRequest.crop} />
          <SummaryRow icon="location-outline" label="Farm" value={createdRequest.area} />
        </View>
        <View style={styles.costCard}>
          <Text style={styles.costFormula}>{createdRequest.peopleNeeded} people × {selectedDays} days × ₹{createdRequest.payPerDay}</Text>
          <Text style={styles.costTotal}>₹{estimatedTotal.toLocaleString('en-IN')}</Text>
          <Text style={styles.helperText}>Estimated labour cost, paid directly to workers.</Text>
        </View>
      </ScrollView>
      <View style={styles.successFooter}>
        <PrimaryButton label="View requests" onPress={onViewRequests} disabled={false} />
        <SecondaryButton label="Back to Find workers" onPress={onBackToSearch} />
      </View>
    </View>;
  }

  return <View style={styles.page}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            setError('');
            if (step === 'work') onBackToSearch();
            else setStep(step === 'review' ? 'schedule' : 'work');
          }}
          accessibilityRole="button"
          accessibilityLabel={step === 'work' ? 'Back to worker search' : 'Go to previous step'}
        >
          <Icon name="chevron-back" size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.stepLabel}>{step === 'work' ? '1 / 3' : step === 'schedule' ? '2 / 3' : '3 / 3'}</Text>
        </View>
      </View>

      {step === 'work' && <>
        <Text style={styles.sectionTitle}>What work?</Text>
        <Text style={styles.sectionSubtitle}>Choose a skill workers have added, or enter your own.</Text>
        {optionsLoading && <View style={styles.loadingRow}><ActivityIndicator color={colors.primary} /><Text style={styles.helperText}>Loading work options…</Text></View>}
        {!!optionsError && <Text style={styles.errorText} accessibilityRole="alert">{optionsError} You can still enter the work manually.</Text>}
        {!!options.workTypes.length && <View style={styles.choiceGrid}>
          {options.workTypes.map((value) => <ChoiceCard key={value} label={value} selected={workType === value} onPress={() => setWorkType(value)} />)}
        </View>}
        <Field label="Work" value={workType} onChangeText={setWorkType} placeholder="Enter the work needed" accessibilityLabel="Work type" />

        <Text style={styles.sectionTitle}>Which crop?</Text>
        <Text style={styles.sectionSubtitle}>Your farm crops are loaded from your saved profile.</Text>
        {!!options.crops.length && <View style={styles.chipRow}>
          {options.crops.map((value) => <ChoicePill key={value} label={value} selected={crop === value} onPress={() => setCrop(value)} />)}
        </View>}
        <Field label="Crop" value={crop} onChangeText={setCrop} placeholder="Enter crop" accessibilityLabel="Crop" />

        <Text style={styles.sectionTitle}>Which farm?</Text>
        {!!options.farms.length && <View style={styles.farmChoices}>
          {options.farms.map((farm) => <Pressable
            key={farm.id}
            style={[styles.farmChoice, farmLocationId === farm.id && styles.farmChoiceSelected]}
            onPress={() => { setFarmLocationId(farm.id); setArea(farm.address); if (!crop) setCrop(farm.crop); }}
            accessibilityRole="radio"
            accessibilityState={{ selected: farmLocationId === farm.id }}
          >
            <Icon name="location-outline" color={farmLocationId === farm.id ? colors.primary : colors.muted} />
            <View style={styles.farmCopy}><Text style={styles.farmName}>{farm.name}</Text><Text style={styles.farmAddress}>{farm.address}</Text></View>
            {farmLocationId === farm.id && <Icon name="checkmark-circle" color={colors.primary} />}
          </Pressable>)}
        </View>}
        <Field
          label={options.farms.length ? 'Farm location' : 'Farm village or location'}
          value={area}
          onChangeText={(value) => { setArea(value); setFarmLocationId(null); }}
          placeholder="Enter farm location"
          accessibilityLabel="Farm location"
        />
        <Text style={styles.helperText}>Options come from saved worker skills and your farm profile. You can enter a value if it is not listed.</Text>
        <ImageField image={requestImage} onChoose={() => { void chooseImage(); }} onRemove={() => setRequestImage(null)} />
      </>}

      {step === 'schedule' && <>
        <Text style={styles.sectionTitle}>When do you need workers?</Text>
        <View style={styles.dateFields}>
          <DateFieldInput label="Start date" date={startDate} minDate={new Date()} onPress={() => openDatePicker('start')} onWebChange={(value) => setRequestDate('start', parseDateInput(value))} />
          <DateFieldInput label="End date" date={endDate} minDate={startDate ?? new Date()} onPress={() => openDatePicker('end')} onWebChange={(value) => setRequestDate('end', parseDateInput(value))} />
        </View>
        {Platform.OS !== 'web' && activeDateField && <Modal transparent animationType="slide" onRequestClose={() => setActiveDateField(null)}>
          <View style={styles.dateModalBackdrop}>
            <View style={styles.dateModal}>
              <DateTimePicker
                value={dateDraft}
                mode="date"
                display="spinner"
                minimumDate={activeDateField === 'end' ? startDate ?? new Date() : new Date()}
                onChange={(_event, value) => { if (value) setDateDraft(value); }}
              />
              <PrimaryButton label="Done" onPress={() => { setRequestDate(activeDateField, dateDraft); setActiveDateField(null); }} disabled={false} />
            </View>
          </View>
        </Modal>}
        <Field label="People needed" value={people} onChangeText={(value) => { setPeople(value); setError(''); }} placeholder="Number of workers" keyboardType="number-pad" accessibilityLabel="People needed" />
        <Field label="Pay per worker / day (₹)" value={pay} onChangeText={(value) => { setPay(value); setError(''); }} placeholder="Enter daily pay" keyboardType="number-pad" accessibilityLabel="Daily pay per worker" />
        {!!selectedWorkers.length && <View style={styles.selectedCard}>
          <Icon name="people-outline" color={colors.primary} />
          <Text style={styles.selectedText}>{Math.min(selectedCapacity, peopleNeeded)} people assigned across {selectedWorkers.length} selected {selectedWorkers.length === 1 ? 'group' : 'groups'}. Add more from Find workers.</Text>
        </View>}
      </>}

      {step === 'review' && <>
        <View style={styles.summaryCard}>
          {selectedWorkers.map((worker) => <SummaryRow key={worker.id} icon="person-outline" label={worker.name} value="Selected" />)}
          <SummaryRow icon="calendar-outline" label="Dates" value={startDate && endDate ? dateRangeLabel(dateInputValue(startDate), dateInputValue(endDate)) : ''} />
          <SummaryRow icon="reader-outline" label="Work" value={workType} />
          <SummaryRow icon="leaf-outline" label="Crop" value={crop} />
          <SummaryRow icon="location-outline" label="Farm" value={area} />
        </View>
        <View style={styles.costCard}>
          <Text style={styles.costFormula}>{peopleNeeded} people × {selectedDays} days × ₹{payPerDay}</Text>
          <Text style={styles.costTotal}>₹{estimatedTotal.toLocaleString('en-IN')}</Text>
          <Text style={styles.helperText}>Estimated labour cost. Pay is arranged directly with workers.</Text>
        </View>
        <View style={styles.noticeRow}>
          <Icon name="information-circle-outline" color={colors.muted} />
          <Text style={styles.noticeText}>The request will be saved with your selected workers. Notifications and worker replies are not yet available.</Text>
        </View>
        <View style={styles.noticeRow}>
          <Icon name="people-outline" color={colors.muted} />
          <Text style={styles.noticeText}>{Math.min(selectedCapacity, peopleNeeded)} of {peopleNeeded} people covered so far. You can add workers later.</Text>
        </View>
      </>}

      {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}
    </ScrollView>

    {step !== 'sent' && <View style={styles.footer}>
      {step === 'work' && <PrimaryButton label="Continue to dates" onPress={continueToSchedule} disabled={optionsLoading && !workType.trim()} />}
      {step === 'schedule' && <PrimaryButton label="Review request" onPress={continueToReview} disabled={false} />}
      {step === 'review' && <PrimaryButton label={submitting ? 'Saving request…' : `Save request${selectedWorkers.length ? ` for ${selectedWorkers.length}` : ''}`} onPress={() => { void submitRequest(); }} disabled={submitting} />}
    </View>}
  </View>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType, accessibilityLabel }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad';
  accessibilityLabel: string;
}) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <AppTextInput
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      keyboardType={keyboardType}
      accessibilityLabel={accessibilityLabel}
      maxLength={accessibilityLabel === 'Farm location' ? 160 : 80}
    />
  </View>;
}

function ChoiceCard({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable
    style={[styles.choiceCard, selected && styles.choiceCardSelected]}
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityState={{ selected }}
  >
    <Text style={styles.choiceLabel}>{label}</Text>
    <View style={[styles.radio, selected && styles.radioSelected]}>{selected && <View style={styles.radioDot} />}</View>
  </Pressable>;
}

function ChoicePill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable style={[styles.choicePill, selected && styles.choicePillSelected]} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
    <Text style={[styles.choicePillText, selected && styles.choicePillTextSelected]}>{label}</Text>
  </Pressable>;
}

function DateFieldInput({ label, date, minDate, onPress, onWebChange }: {
  label: string;
  date: Date | null;
  minDate: Date;
  onPress: () => void;
  onWebChange: (value: string) => void;
}) {
  return <View style={styles.dateField}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {Platform.OS === 'web' ? <input
      type="date"
      value={dateInputValue(date)}
      min={dateInputValue(minDate)}
      onChange={(event) => onWebChange(event.currentTarget.value)}
      aria-label={label}
      style={{ height: 54, width: '100%', boxSizing: 'border-box', border: '1px solid #DCE5F0', borderRadius: 16, padding: '0 12px', color: '#0F172A', backgroundColor: '#FFFFFF', fontSize: 15 }}
    /> : <Pressable style={styles.dateButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${dateLabel(date)}`}>
      <Icon name="calendar-outline" color={colors.muted} />
      <Text style={styles.dateButtonText}>{dateLabel(date)}</Text>
    </Pressable>}
  </View>;
}

function ImageField({ image, onChoose, onRemove }: {
  image: ImagePicker.ImagePickerAsset | null;
  onChoose: () => void;
  onRemove: () => void;
}) {
  return <View style={styles.imageField}>
    <Text style={styles.fieldLabel}>Crop photo (optional)</Text>
    <View style={styles.imageRow}>
      {image && <Image source={{ uri: image.uri }} style={styles.imagePreview} />}
      <Pressable style={styles.imageButton} onPress={onChoose} accessibilityRole="button" accessibilityLabel={image ? 'Change crop photo' : 'Add crop photo'}>
        <Icon name={image ? 'camera-outline' : 'image-outline'} color={colors.primary} />
        <Text style={styles.imageButtonText}>{image ? 'Change photo' : 'Add crop photo'}</Text>
      </Pressable>
      {image && <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel="Remove crop photo"><Icon name="close-circle" color={colors.muted} /></Pressable>}
    </View>
    <Text style={styles.helperText}>JPEG, PNG, WebP, or HEIC; up to 5 MB.</Text>
  </View>;
}

function SummaryRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return <View style={styles.summaryRow}>
    <Icon name={icon} size={20} />
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={styles.summaryValue} numberOfLines={2}>{value}</Text>
  </View>;
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return <Pressable style={[styles.primaryButton, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled} accessibilityRole="button">
    {disabled && <ActivityIndicator color="#FFFFFF" />}
    <Text style={styles.primaryButtonText}>{label}</Text>
  </Pressable>;
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable style={styles.secondaryButton} onPress={onPress} accessibilityRole="button"><Text style={styles.secondaryButtonText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'transparent' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 23 },
  backButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  headerCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: colors.text, fontSize: 23, fontWeight: '800' },
  stepLabel: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  sectionTitle: { color: colors.text, fontSize: 27, fontWeight: '800', marginBottom: 3 },
  sectionSubtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 17 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 18 },
  choiceCard: { width: '48%', minHeight: 115, justifyContent: 'space-between', padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface },
  choiceCardSelected: { borderWidth: 2, borderColor: colors.primary },
  choiceLabel: { color: colors.text, fontSize: 17, fontWeight: '700', textTransform: 'capitalize' },
  radio: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end', borderWidth: 2, borderColor: '#CBD5E1', borderRadius: 14 },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primary },
  field: { marginBottom: 19 },
  fieldLabel: { color: colors.muted, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  input: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 15, color: colors.text, backgroundColor: colors.surface, fontSize: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 16 },
  choicePill: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 23, backgroundColor: colors.surface },
  choicePillSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  choicePillText: { color: colors.text, fontSize: 15, fontWeight: '600', textTransform: 'capitalize' },
  choicePillTextSelected: { color: '#FFFFFF' },
  farmChoices: { gap: 9, marginBottom: 16 },
  farmChoice: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  farmChoiceSelected: { borderWidth: 2, borderColor: colors.primary },
  farmCopy: { flex: 1 },
  farmName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  farmAddress: { color: colors.muted, fontSize: 13, marginTop: 3 },
  helperText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  imageField: { marginBottom: 18 },
  imageRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12 },
  imagePreview: { width: 58, height: 58, borderRadius: 12 },
  imageButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface },
  imageButtonText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  dateFields: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  dateField: { flex: 1 },
  dateButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  dateButtonText: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  dateModalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 26, 46, 0.45)' },
  dateModal: { padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface },
  selectedCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginBottom: 17, borderRadius: 15, backgroundColor: colors.primarySoft },
  selectedText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  summaryCard: { paddingHorizontal: 16, marginBottom: 17, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface },
  summaryRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  summaryLabel: { flex: 1, color: colors.muted, fontSize: 15 },
  summaryValue: { maxWidth: '55%', color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'right' },
  costCard: { padding: 18, marginBottom: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surfaceMuted },
  costFormula: { color: colors.muted, fontSize: 16 },
  costTotal: { color: colors.text, fontSize: 34, fontWeight: '800', marginTop: 3 },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 13 },
  noticeText: { flex: 1, color: colors.muted, fontSize: 14, lineHeight: 21 },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20, marginVertical: 12 },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  primaryButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 18, borderRadius: 30, backgroundColor: colors.primary },
  primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  buttonDisabled: { opacity: 0.6 },
  successContent: { width: '100%', maxWidth: 760, alignSelf: 'center', alignItems: 'center', paddingHorizontal: 20, paddingTop: 48, paddingBottom: 25 },
  successIcon: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', borderRadius: 60, backgroundColor: colors.successSoft, marginBottom: 25 },
  successTitle: { color: colors.text, fontSize: 34, fontWeight: '800', textAlign: 'center' },
  successSubtitle: { color: colors.muted, fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 10, marginBottom: 23 },
  successFooter: { gap: 10, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  secondaryButton: { minHeight: 53, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 28, backgroundColor: colors.surface },
  secondaryButtonText: { color: colors.text, fontSize: 16, fontWeight: '700' },
});
