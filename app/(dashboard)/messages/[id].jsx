import { StyleSheet, FlatList, Pressable, View, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { useState, useEffect, useRef } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMessaging } from '../../../hooks/useMessaging'
import { useUser } from '../../../hooks/useUser'
import { Colors } from '../../../constants/Colors'
import { useColorScheme } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import ThemedText from "../../../components/ThemedText"
import ThemedView from "../../../components/ThemedView"
import ThemedLoader from "../../../components/ThemedLoader"
import Spacer from "../../../components/Spacer"

const ConversationScreen = () => {
  const { id: conversationId } = useLocalSearchParams()
  const { 
    messages, 
    conversations, 
    fetchMessages, 
    sendMessage, 
    markMessagesAsRead, 
    getOtherParticipant 
  } = useMessaging()
  const { user } = useUser()
  const router = useRouter()
  const colorScheme = useColorScheme()
  const theme = Colors[colorScheme] ?? Colors.light

  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const flatListRef = useRef(null)

  const conversation = conversations.find(conv => conv.$id === conversationId)
  const conversationMessages = messages[conversationId] || []
  const otherParticipant = conversation ? getOtherParticipant(conversation) : null

  useEffect(() => {
    if (conversationId) {
      loadMessages()
      markMessagesAsRead(conversationId)
    }
  }, [conversationId])

  const loadMessages = async () => {
    try {
      setLoading(true)
      await fetchMessages(conversationId)
    } catch (error) {
      console.error('Error loading messages:', error)
      Alert.alert('Error', 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async () => {
    if (!messageText.trim() || sending) return

    const tempMessage = messageText.trim()
    setMessageText('')
    setSending(true)

    try {
      await sendMessage(conversationId, tempMessage)
      // Scroll to bottom after sending
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
    } catch (error) {
      console.error('Error sending message:', error)
      Alert.alert('Error', 'Failed to send message')
      setMessageText(tempMessage) // Restore message text on error
    } finally {
      setSending(false)
    }
  }

  const formatMessageTime = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatMessageDate = (dateString) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    } else {
      return date.toLocaleDateString()
    }
  }

  const renderMessage = ({ item, index }) => {
    const isMyMessage = item.senderId === user.$id
    const previousMessage = index > 0 ? conversationMessages[index - 1] : null
    const showDateSeparator = !previousMessage || 
      new Date(item.sentAt).toDateString() !== new Date(previousMessage.sentAt).toDateString()

    return (
      <View>
        {showDateSeparator && (
          <View style={styles.dateSeparator}>
            <ThemedText style={styles.dateText}>
              {formatMessageDate(item.sentAt)}
            </ThemedText>
          </View>
        )}
        
        <View style={[
          styles.messageContainer,
          isMyMessage ? styles.myMessageContainer : styles.otherMessageContainer
        ]}>
          <View style={[
            styles.messageBubble,
            isMyMessage ? styles.myMessageBubble : styles.otherMessageBubble
          ]}>
            <ThemedText style={[
              styles.messageText,
              isMyMessage ? styles.myMessageText : styles.otherMessageText
            ]}>
              {item.content}
            </ThemedText>
            <ThemedText style={[
              styles.messageTime,
              isMyMessage ? styles.myMessageTime : styles.otherMessageTime
            ]}>
              {formatMessageTime(item.sentAt)}
            </ThemedText>
          </View>
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <ThemedView style={styles.container} safe={true}>
        <ThemedLoader />
      </ThemedView>
    )
  }

  if (!conversation) {
    return (
      <ThemedView style={styles.container} safe={true}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#FF3B30" />
          <ThemedText style={styles.errorText}>Conversation not found</ThemedText>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText style={styles.backButtonText}>Go Back</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    )
  }

  return (
    <ThemedView style={styles.container} safe={true}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.navBackground }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </Pressable>
        
        <View style={styles.headerInfo}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={20} color="#7F5AF0" />
          </View>
          <View style={styles.headerText}>
            <ThemedText style={styles.participantName}>
              {otherParticipant?.email?.split('@')[0] || 'Unknown User'}
            </ThemedText>
            {conversation.serviceTitle && (
              <ThemedText style={styles.serviceContext}>
                Re: {conversation.serviceTitle}
              </ThemedText>
            )}
          </View>
        </View>

        <Pressable style={styles.headerAction}>
          <Ionicons name="information-circle-outline" size={24} color={theme.text} />
        </Pressable>
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={conversationMessages}
        keyExtractor={(item) => item.$id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <Ionicons name="chatbubble-outline" size={48} color="#7F5AF0" />
            <ThemedText style={styles.emptyText}>No messages yet</ThemedText>
            <ThemedText style={styles.emptySubtext}>Start the conversation!</ThemedText>
          </View>
        }
      />

      {/* Message Input */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={[styles.inputContainer, { backgroundColor: theme.navBackground }]}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={[styles.textInput, { 
                backgroundColor: theme.uiBackground,
                color: theme.text,
                borderColor: '#7F5AF0'
              }]}
              placeholder="Type a message..."
              placeholderTextColor={theme.textSecondary}
              value={messageText}
              onChangeText={setMessageText}
              multiline
              maxLength={1000}
              editable={!sending}
            />
            <Pressable 
              onPress={handleSendMessage}
              style={[
                styles.sendButton,
                (!messageText.trim() || sending) && styles.sendButtonDisabled
              ]}
              disabled={!messageText.trim() || sending}
            >
              {sending ? (
                <Ionicons name="hourglass-outline" size={20} color="#fff" />
              ) : (
                <Ionicons name="send" size={20} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  )
}

export default ConversationScreen

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#7F5AF020',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#7F5AF020',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '600',
  },
  serviceContext: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  headerAction: {
    padding: 8,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingBottom: 20,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dateText: {
    fontSize: 12,
    opacity: 0.6,
    backgroundColor: '#7F5AF020',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  messageContainer: {
    marginVertical: 2,
  },
  myMessageContainer: {
    alignItems: 'flex-end',
  },
  otherMessageContainer: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  myMessageBubble: {
    backgroundColor: '#7F5AF0',
    borderBottomRightRadius: 4,
  },
  otherMessageBubble: {
    backgroundColor: '#F0F0F0',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 4,
  },
  myMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#000',
  },
  messageTime: {
    fontSize: 11,
    opacity: 0.7,
  },
  myMessageTime: {
    color: '#fff',
    textAlign: 'right',
  },
  otherMessageTime: {
    color: '#666',
  },
  emptyMessages: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.6,
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#7F5AF020',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7F5AF0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7F5AF0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0,
    elevation: 0,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  backButtonText: {
    color: '#7F5AF0',
    fontSize: 16,
    fontWeight: '600',
  },
})