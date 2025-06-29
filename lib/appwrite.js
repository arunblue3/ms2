import { Client, Account, Avatars, Databases } from "react-native-appwrite"

export const client = new Client()

// Configuration
const PROJECT_ID = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID || '6860ef510001d9ff1a12'
const ENDPOINT = process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1'

client
  .setProject(PROJECT_ID)
  .setEndpoint(ENDPOINT)
  .setPlatform('localhost') // Required for web development to handle CORS properly

export const account = new Account(client)
export const avatars = new Avatars(client)
export const databases = new Databases(client)

// Database configuration
export const DATABASE_CONFIG = {
  DATABASE_ID: process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID || '6860efb40034368dd9d3',
  SERVICES_COLLECTION_ID: process.env.EXPO_PUBLIC_APPWRITE_SERVICES_COLLECTION_ID || '6860f096000662169436',
  CONVERSATIONS_COLLECTION_ID: process.env.EXPO_PUBLIC_APPWRITE_CONVERSATIONS_COLLECTION_ID || '6860f14d003c47e9bdab',
  MESSAGES_COLLECTION_ID: process.env.EXPO_PUBLIC_APPWRITE_MESSAGES_COLLECTION_ID || '6860f2480004ede12d56'
}

// Enhanced error handling for authentication issues
export function handleAppwriteError(error) {
  console.error('Appwrite Error Details:', {
    message: error.message,
    code: error.code,
    type: error.type,
    response: error.response
  })

  if (error.message.includes('missing scope') || 
      error.message.includes('guests') || 
      error.code === 401 ||
      error.type === 'user_unauthorized') {
    return {
      isAuthError: true,
      message: 'Authentication required. Please log in again.',
      shouldLogout: true
    }
  }

  if (error.message.includes('Collection with the requested ID could not be found') ||
      error.message.includes('Database not found')) {
    return {
      isAuthError: false,
      message: 'Database configuration error. Please check your setup.',
      shouldLogout: false
    }
  }

  return {
    isAuthError: false,
    message: error.message || 'An unexpected error occurred',
    shouldLogout: false
  }
}

// Test authentication status
export async function testAuthStatus() {
  try {
    console.log('🔍 Testing authentication status...')
    const user = await account.get()
    console.log('✅ User authenticated:', user.email, '(ID:', user.$id + ')')
    return { success: true, user }
  } catch (error) {
    console.log('❌ Authentication test failed:', error.message)
    return { success: false, error: handleAppwriteError(error) }
  }
}

// Log configuration on startup
console.log('🔧 Appwrite Configuration:')
console.log('Project ID:', PROJECT_ID)
console.log('Endpoint:', ENDPOINT)
console.log('Database ID:', DATABASE_CONFIG.DATABASE_ID)
console.log('Services Collection:', DATABASE_CONFIG.SERVICES_COLLECTION_ID)
console.log('Conversations Collection:', DATABASE_CONFIG.CONVERSATIONS_COLLECTION_ID)
console.log('Messages Collection:', DATABASE_CONFIG.MESSAGES_COLLECTION_ID)