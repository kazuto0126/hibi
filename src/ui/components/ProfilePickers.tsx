/**
 * 首次設定與設定頁共用的選擇元件：程度（單選）、學習目的（複選）、興趣（複選）。
 * 選項文字沿用舊版 japanessapp 的設計（src/core/profile.ts）。
 */
import { Pressable, Text, View } from 'react-native';
import { GOAL_OPTIONS, INTEREST_OPTIONS, LEVEL_OPTIONS, type Option } from '../../core/profile';
import type { Goal, Interest, Level } from '../../core/types';
import { RADIUS, SPACE, T, useTheme } from '../theme';
import { Chip } from './Basics';

/** 有標題和說明的選項卡片；multiple 為 true 時是方形勾選框，否則是圓形單選 */
function ChoiceCard({
  label,
  description,
  selected,
  multiple,
  onPress,
  testID,
}: {
  label: string;
  description?: string;
  selected: boolean;
  multiple: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { c, f } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.m,
        paddingVertical: SPACE.m,
        paddingHorizontal: SPACE.l,
        borderRadius: RADIUS.m,
        borderWidth: 1.5,
        borderColor: selected ? c.accent : c.line,
        backgroundColor: selected ? c.accentSoft : c.surface,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: multiple ? 5 : 10,
          borderWidth: 1.5,
          borderColor: selected ? c.accent : c.inkFaint,
          backgroundColor: selected ? c.accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? (
          multiple ? (
            <Text style={{ color: c.onAccent, fontSize: 13, lineHeight: 15, fontWeight: '700' }}>✓</Text>
          ) : (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.onAccent }} />
          )
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: T.body, fontWeight: '600', color: c.ink, fontFamily: f.ui }}>{label}</Text>
        {description ? (
          <Text style={{ fontSize: T.small, color: c.inkSoft, fontFamily: f.ui, marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function Cards<T extends string>({
  options,
  isSelected,
  onPick,
  multiple,
  testPrefix,
}: {
  options: Option<T>[];
  isSelected: (v: T) => boolean;
  onPick: (v: T) => void;
  multiple: boolean;
  testPrefix: string;
}) {
  return (
    <View style={{ gap: SPACE.s }}>
      {options.map((o) => (
        <ChoiceCard
          key={o.value}
          testID={`${testPrefix}-${o.value}`}
          label={o.label}
          description={o.description}
          selected={isSelected(o.value)}
          multiple={multiple}
          onPress={() => onPick(o.value)}
        />
      ))}
    </View>
  );
}

function Chips<T extends string>({
  options,
  isSelected,
  onPick,
  testPrefix,
}: {
  options: Option<T>[];
  isSelected: (v: T) => boolean;
  onPick: (v: T) => void;
  testPrefix: string;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s }}>
      {options.map((o) => (
        <Chip
          key={o.value}
          testID={`${testPrefix}-${o.value}`}
          label={o.label}
          selected={isSelected(o.value)}
          onPress={() => onPick(o.value)}
        />
      ))}
    </View>
  );
}

/** compact：設定頁用小膠囊；否則用有說明的卡片（首次設定） */
export function LevelPicker({
  value,
  onChange,
  compact,
}: {
  value: Level | null;
  onChange: (v: Level) => void;
  compact?: boolean;
}) {
  const props = {
    options: LEVEL_OPTIONS,
    isSelected: (v: Level) => v === value,
    onPick: onChange,
    testPrefix: 'level',
  };
  return compact ? <Chips {...props} /> : <Cards {...props} multiple={false} />;
}

export function GoalPicker({
  value,
  onChange,
  compact,
}: {
  value: Goal[];
  onChange: (v: Goal[]) => void;
  compact?: boolean;
}) {
  const props = {
    options: GOAL_OPTIONS,
    isSelected: (v: Goal) => value.includes(v),
    onPick: (v: Goal) => onChange(toggle(value, v)),
    testPrefix: 'goal',
  };
  return compact ? <Chips {...props} /> : <Cards {...props} multiple />;
}

export function InterestPicker({
  value,
  onChange,
}: {
  value: Interest[];
  onChange: (v: Interest[]) => void;
}) {
  return (
    <Chips
      options={INTEREST_OPTIONS}
      isSelected={(v) => value.includes(v)}
      onPick={(v) => onChange(toggle(value, v))}
      testPrefix="interest"
    />
  );
}
