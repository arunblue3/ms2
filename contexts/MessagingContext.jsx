import { createContext, useEffect, useState } from "react"
import { databases, client, DATABASE_CONFIG, handleAppwriteError } from "../lib/appwrite"
import { ID, Permission, Query, Role } from "react-native-appwrite"
import { useUser } from "../hooks/useUser"

export const MessagingContext = createContext()

export function MessagingProvider({ children }) {
  const [conversations, setConversations] = useState([])
  const [messages, setMessages] = useState({})
  const [loading, setLoading] = useState(false)
  const { user, refreshAuth } = useUser()

  // Handle authentication errors consistently
  async function handleAuthError(error) {
    const errorInfo = handleAppwriteError(error)
    
    if (errorInfo.isAuthError && errorInfo.shouldLogout) {
      console.log('🔄 Attempting to refresh authentication...')
      const refreshedUser = await refreshAuth()
      
      if (!refreshedUser) {
        console.log('❌ Auth refresh failed, user needs to log in again')
        throw new Error('Your session has expired. Please log in again.')
      }
      
      console.log('✅ Auth refreshed successfully')
      return refreshedUser
    }
    
    throw new Error(errorInfo.message)
  }

  // Test messaging database connection
  async function testMessagingConnection() {
    try {
      console.log('🧪 Testing messaging database connection...')
      console.log('Database ID:', DATABASE_CONFIG.DATABASE_ID)
      console.log('Conversations Collection ID:', DATABASE_CONFIG.CONVERSATIONS_COLLECTION_ID)
      console.log('Messages Collection ID:', DATABASE_CONFIG.MESSAGES_COLLECTION_ID)
      
      if (!user) {
        console.log('⚠️ No user authenticated for messaging test')
        return false
      }
      
      // Test conversations collection
      await databases.listDocuments(
        DATABASE_CONFIG.DATABASE_ID,
        DATABASE_CONFIG.CONVERSATIONS_COLLECTION_ID,
        [Query.limit(1)]
      )
      
      // Test messages collection
      await databases.listDocuments(
        DATABASE_CONFIG.DATABASE_ID,
        DATABASE_CONFIG.MESSAGES_COLLECTION_ID,
        [Query.limit(1)]
      )
      
      console.log('✅ Messaging database connection successful!')
      return true
    } catch (error) {
      console.error('❌ Messaging database connection failed:', error.message)
      
      try {
        await handleAuthError(error)
        // If we get here, auth was refreshed, try again
        return await testMessagingConnection()
      } catch (authError) {
        console.error('❌ Messaging auth handling failed:', authError.message)
        return false
      }
    }
  }

  // Fetch user's conversations
  async function fetchConversations() {
    if (!user) {
      console.log('⚠️ No user authenticated for conversations')
      setConversations([])
      return []
    }

    try {
      setLoading(true)
      console.log('💬 Fetching conversations for user:', user.$id)
      
      const response = await databases.listDocuments(
        DATABASE_CONFIG.DATABASE_ID,
        DATABASE_CONFIG.CONVERSATIONS_COLLECTION_ID,
        [
          Query.or([
            Query.equal('participant1Id', user.$id),
            Query.equal('participant2Id', user.$id)
          ]),
          Query.orderDesc('lastMessageAt')
        ]
      )

      console.log('✅ Successfully fetched conversations:', response.documents.length)
      setConversations(response.documents)
      return response.documents
    } catch (error) {
      console.error('❌ Error fetching conversations:', error)
      
      try {
        await handleAuthError(error)
        // If auth was refreshed, try again
        return await fetchConversations()
      } catch (authError) {
        console.error('❌ Final error in fetchConversations:', authError.message)
        setConversations([])
        throw authError
      }
    } finally {
      setLoading(false)
    }
  }

  // Fetch messages for a specific conversation
  async function fetchMessages(conversationId) {
    try {
      if (!user) {
        throw new Error('Authentication required to fetch messages')
      }

      console.log('💬 Fetching messages for conversation:', conversationId)
      
      const response = await databases.listDocuments(
        DATABASE_CONFIG.DATABASE_ID,
        DATABASE_CONFIG.MESSAGES_COLLECTION_ID,
        [
          Query.equal('conversationId', conversationId),
          Query.orderAsc('$createdAt'),
          Query.limit(100)
        ]
      )

      console.log('✅ Successfully fetched messages:', response.documents.length)
      
      setMessages(prev => ({
        ...prev,
        [conversationId]: response.documents
      }))

      return response.documents
    } catch (error) {
      console.error('❌ Error fetching messages:', error)
      await handleAuthError(error)
    }
  }

  // Create or get existing conversation
  async function createOrGetConversation(otherUserId, serviceId = null, serviceTitle = null) {
    if (!user || !otherUserId) {
      throw new Error('Both users must be specified and authenticated')
    }

    if (user.$id === otherUserId) {
      throw new Error('Cannot create conversation with yourself')
    }

    try {
      console.log('💬 Creating/getting conversation between:', user.$id, 'and', otherUserId)

      // First, check if conversation already exists
      const existingConversations = await databases.listDocuments(
        DATABASE_CONFIG.DATABASE_ID,
        DATABASE_CONFIG.CONVERSATIONS_COLLECTION_ID,
        [
          Query.or([
            Query.and([
              Query.equal('participant1Id', user.$id),
              Query.equal('participant2Id', otherUserId)
            ]),
            Query.and([
              Query.equal('participant1Id', otherUserId),
              Query.equal('participant2Id', user.$id)
            ])
          ])
        ]
      )

      if (existingConversations.documents.length > 0) {
        console.log('✅ Found existing conversation')
        return existingConversations.documents[0]
      }

      // Create new conversation
      const conversationData = {
        participant1Id: user.$id,
        participant2Id: otherUserId,
        participant1Email: user.email,
        participant2Email: 'Unknown User',
        lastMessage: '',
        lastMessageAt: new Date().toISOString(),
        serviceId: serviceId || null,
        serviceTitle: serviceTitle || null,
        unreadCount1: 0,
        unreadCount2: 0,
      }

      const response = await databases.createDocument(
        DATABASE_CONFIG.DATABASE_ID,
        DATABASE_CONFIG.CONVERSATIONS_COLLECTION_ID,
        ID.unique(),
        conversationData,
        [
          Permission.read(Role.user(user.$id)),
          Permission.read(Role.user(otherUserId)),
          Permission.update(Role.user(user.$id)),
          Permission.update(Role.user(otherUserId)),
          Permission.delete(Role.user(user.$id)),
          Permission.delete(Role.user(otherUserId)),
        ]
      )

      console.log('✅ Created new conversation:', response.$id)
      setConversations(prev => [response, ...prev])
      return response
    } catch (error) {
      console.error('❌ Error creating/getting conversation:', error)
      await handleAuthError(error)
    }
  }

  // Send a message
  async function sendMessage(conversationId, content, messageType = 'text') {
    if (!user || !conversationId || !content.trim()) {
      throw new Error('Invalid message data or authentication required')
    }

    try {
      console.log('💬 Sending message to conversation:', conversationId)

      const messageData = {
        conversationId,
        senderId: user.$id,
        senderEmail: user.email,
        content: content.trim(),
        messageType,
        isRead: false,
        sentAt: new Date().toISOString()
      }

      const response = await databases.createDocument(
        DATABASE_CONFIG.DATABASE_ID,
        DATABASE_CONFIG.MESSAGES_COLLECTION_ID,
        ID.unique(),
        messageData,
        [
          Permission.read(Role.any()),
          Permission.update(Role.user(user.$id)),
          Permission.delete(Role.user(user.$id)),
        ]
      )

      console.log('✅ Message sent:', response.$id)

      setMessages(prev => ({
        ...prev,
        [conversationId]: [...(prev[conversationId] || []), response]
      }))

      await updateConversationLastMessage(conversationId, content)
      return response
    } catch (error) {
      console.error('❌ Error sending message:', error)
      await handleAuthError(error)
    }
  }

  // Update conversation's last message
  async function updateConversationLastMessage(conversationId, lastMessage) {
    try {
      if (!user) {
        throw new Error('Authentication required to update conversation')
      }

      await databases.updateDocument(
        DATABASE_CONFIG.DATABASE_ID,
        DATABASE_CONFIG.CONVERSATIONS_COLLECTION_ID,
        conversationId,
        {
          lastMessage: lastMessage.substring(0, 100),
          lastMessageAt: new Date().toISOString()
        }
      )

      setConversations(prev => 
        prev.map(conv => 
          conv.$id === conversationId 
            ? { ...conv, lastMessage, lastMessageAt: new Date().toISOString() }
            : conv
        )
      )
    } catch (error) {
      console.error('❌ Error updating conversation last message:', error)
    }
  }

  // Mark messages as read
  async function markMessagesAsRead(conversationId) {
    try {
      if (!user) {
        console.log('⚠️ No user authenticated for marking messages as read')
        return
      }

      const conversationMessages = messages[conversationId] || []
      const unreadMessages = conversationMessages.filter(
        msg => !msg.isRead && msg.senderId !== user.$id
      )

      for (const message of unreadMessages) {
        await databases.updateDocument(
          DATABASE_CONFIG.DATABASE_ID,
          DATABASE_CONFIG.MESSAGES_COLLECTION_ID,
          message.$id,
          { isRead: true }
        )
      }

      setMessages(prev => ({
        ...prev,
        [conversationId]: (prev[conversationId] || []).map(msg => 
          msg.senderId !== user.$id ? { ...msg, isRead: true } : msg
        )
      }))

      console.log('✅ Marked messages as read for conversation:', conversationId)
    } catch (error) {
      console.error('❌ Error marking messages as read:', error)
    }
  }

  // Get other participant info
  function getOtherParticipant(conversation) {
    if (!conversation || !user) return null
    
    return {
      id: conversation.participant1Id === user.$id ? conversation.participant2Id : conversation.participant1Id,
      email: conversation.participant1Id === user.$id ? conversation.participant2Email : conversation.participant1Email
    }
  }

  // Get unread count for current user
  function getUnreadCount(conversation) {
    if (!conversation || !user) return 0
    
    const conversationMessages = messages[conversation.$id] || []
    return conversationMessages.filter(
      msg => !msg.isRead && msg.senderId !== user.$id
    ).length
  }

  useEffect(() => {
    let unsubscribeConversations
    let unsubscribeMessages

    if (user) {
      console.log('👤 Setting up messaging for user:', user.$id)
      
      // Wait for user session to be fully established
      setTimeout(() => {
        testMessagingConnection().then(connectionOk => {
          if (connectionOk) {
            fetchConversations()
          } else {
            console.error('❌ Skipping fetchConversations due to connection failure')
          }
        })
      }, 1500) // Increased delay

      // Set up real-time subscriptions
      const conversationsChannel = `databases.${DATABASE_CONFIG.DATABASE_ID}.collections.${DATABASE_CONFIG.CONVERSATIONS_COLLECTION_ID}.documents`
      const messagesChannel = `databases.${DATABASE_CONFIG.DATABASE_ID}.collections.${DATABASE_CONFIG.MESSAGES_COLLECTION_ID}.documents`

      unsubscribeConversations = client.subscribe(conversationsChannel, (response) => {
        const { payload, events } = response
        console.log('🔄 Conversation real-time update:', events)

        if (events.some(event => event.includes("create"))) {
          setConversations(prev => {
            const exists = prev.some(conv => conv.$id === payload.$id)
            if (!exists && (payload.participant1Id === user.$id || payload.participant2Id === user.$id)) {
              return [payload, ...prev]
            }
            return prev
          })
        }

        if (events.some(event => event.includes("update"))) {
          setConversations(prev => 
            prev.map(conv => 
              conv.$id === payload.$id ? payload : conv
            )
          )
        }
      })

      unsubscribeMessages = client.subscribe(messagesChannel, (response) => {
        const { payload, events } = response
        console.log('🔄 Message real-time update:', events)

        if (events.some(event => event.includes("create"))) {
          setMessages(prev => ({
            ...prev,
            [payload.conversationId]: [...(prev[payload.conversationId] || []), payload]
          }))
        }
      })
    } else {
      console.log('👤 User not authenticated, clearing messaging data')
      setConversations([])
      setMessages({})
    }

    return () => {
      if (unsubscribeConversations) unsubscribeConversations()
      if (unsubscribeMessages) unsubscribeMessages()
    }
  }, [user])

  return (
    <MessagingContext.Provider value={{
      conversations,
      messages,
      loading,
      fetchConversations,
      fetchMessages,
      createOrGetConversation,
      sendMessage,
      markMessagesAsRead,
      getOtherParticipant,
      getUnreadCount,
      testMessagingConnection
    }}>
      {children}
    </MessagingContext.Provider>
  )
}