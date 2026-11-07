import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_WIDTH, RADIUS, SPACE, T, useTheme } from '../theme';

/** 從下方滑出的面板（設定、卡片詳情、編輯） */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { c, f } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
          <Pressable
            accessibilityLabel="關閉"
            onPress={onClose}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(10,14,20,0.42)',
            }}
          />
          <View
            style={{
              width: '100%',
              maxWidth: MAX_WIDTH + 40,
              maxHeight: '92%',
              backgroundColor: c.paper,
              borderTopLeftRadius: RADIUS.l + 4,
              borderTopRightRadius: RADIUS.l + 4,
              paddingBottom: Math.max(insets.bottom, SPACE.l),
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: SPACE.xl,
                paddingTop: SPACE.l,
                paddingBottom: SPACE.s,
              }}
            >
              <Text
                accessibilityRole="header"
                style={{
                  flex: 1,
                  fontSize: T.lead,
                  fontWeight: '700',
                  color: c.ink,
                  fontFamily: f.ui,
                }}
              >
                {title}
              </Text>
              <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}>
                <Text
                  style={{
                    fontSize: T.body,
                    color: c.accent,
                    fontFamily: f.ui,
                    fontWeight: '600',
                  }}
                >
                  完成
                </Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: SPACE.xl,
                paddingBottom: SPACE.l,
                gap: SPACE.l,
              }}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
            {footer ? (
              <View style={{ paddingHorizontal: SPACE.xl, paddingTop: SPACE.s }}>{footer}</View>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
