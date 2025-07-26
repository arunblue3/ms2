import { createContext, useEffect, useState } from "react"
import { databases, client, DATABASE_CONFIG, handleAppwriteError } from "../lib/appwrite"
import { Query } from "react-native-appwrite"
import { useUser } from "../hooks/useUser"

export const PaymentsContext = createContext()

export function PaymentsProvider({ children }) {
  const [payments, setPayments] = useState([])
  const [transactions, setTransactions] = useState([])
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

  // Fetch user's payment history
  async function fetchPayments() {
    if (!user) {
      console.log('⚠️ No user authenticated for payments')
      setPayments([])
      return []
    }

    try {
      setLoading(true)
      console.log('💳 Fetching payments for user:', user.$id)
      
      const response = await databases.listDocuments(
        DATABASE_CONFIG.DATABASE_ID,
        DATABASE_CONFIG.PAYMENTS_COLLECTION_ID,
        [
          Query.or([
            Query.equal('buyerId', user.$id),
            Query.equal('sellerId', user.$id)
          ]),
          Query.orderDesc('$createdAt')
        ]
      )

      console.log('✅ Successfully fetched payments:', response.documents.length)
      setPayments(response.documents)
      return response.documents
    } catch (error) {
      console.error('❌ Error fetching payments:', error)
      
      try {
        await handleAuthError(error)
        // If auth was refreshed, try again
        return await fetchPayments()
      } catch (authError) {
        console.error('❌ Final error in fetchPayments:', authError.message)
        setPayments([])
        throw authError
      }
    } finally {
      setLoading(false)
    }
  }

  // Fetch user's transaction history
  async function fetchTransactions() {
    if (!user) {
      console.log('⚠️ No user authenticated for transactions')
      setTransactions([])
      return []
    }

    try {
      console.log('📊 Fetching transactions for user:', user.$id)
      
      const response = await databases.listDocuments(
        DATABASE_CONFIG.DATABASE_ID,
        DATABASE_CONFIG.TRANSACTIONS_COLLECTION_ID,
        [
          Query.or([
            Query.equal('buyerId', user.$id),
            Query.equal('sellerId', user.$id)
          ]),
          Query.orderDesc('transactionDate')
        ]
      )

      console.log('✅ Successfully fetched transactions:', response.documents.length)
      setTransactions(response.documents)
      return response.documents
    } catch (error) {
      console.error('❌ Error fetching transactions:', error)
      
      try {
        await handleAuthError(error)
        // If auth was refreshed, try again
        return await fetchTransactions()
      } catch (authError) {
        console.error('❌ Final error in fetchTransactions:', authError.message)
        setTransactions([])
        throw authError
      }
    }
  }

  // Get payment by ID
  async function getPaymentById(paymentId) {
    try {
      if (!user) {
        throw new Error('Authentication required to view payment details')
      }
      
      const response = await databases.getDocument(
        DATABASE_CONFIG.DATABASE_ID,
        DATABASE_CONFIG.PAYMENTS_COLLECTION_ID,
        paymentId
      )

      console.log('✅ Successfully fetched payment:', response.$id)
      return response
    } catch (error) {
      console.error('❌ Error fetching payment by ID:', error)
      await handleAuthError(error)
    }
  }

  // Get user's earnings (as a seller)
  function getEarnings() {
    return transactions.filter(transaction => 
      transaction.sellerId === user?.$id && 
      transaction.status === 'completed'
    ).reduce((total, transaction) => total + transaction.amount, 0)
  }

  // Get user's spending (as a buyer)
  function getSpending() {
    return transactions.filter(transaction => 
      transaction.buyerId === user?.$id && 
      transaction.status === 'completed'
    ).reduce((total, transaction) => total + transaction.amount, 0)
  }

  // Get pending payments
  function getPendingPayments() {
    return payments.filter(payment => payment.status === 'pending')
  }

  useEffect(() => {
    let unsubscribePayments
    let unsubscribeTransactions

    if (user) {
      console.log('👤 Setting up payments for user:', user.$id)
      
      // Wait for user session to be fully established
      setTimeout(() => {
        fetchPayments()
        fetchTransactions()
      }, 1500)

      // Set up real-time subscriptions
      const paymentsChannel = `databases.${DATABASE_CONFIG.DATABASE_ID}.collections.${DATABASE_CONFIG.PAYMENTS_COLLECTION_ID}.documents`
      const transactionsChannel = `databases.${DATABASE_CONFIG.DATABASE_ID}.collections.${DATABASE_CONFIG.TRANSACTIONS_COLLECTION_ID}.documents`

      unsubscribePayments = client.subscribe(paymentsChannel, (response) => {
        const { payload, events } = response
        console.log('🔄 Payment real-time update:', events)

        if (events.some(event => event.includes("create"))) {
          setPayments(prev => {
            const exists = prev.some(payment => payment.$id === payload.$id)
            if (!exists && (payload.buyerId === user.$id || payload.sellerId === user.$id)) {
              return [payload, ...prev]
            }
            return prev
          })
        }

        if (events.some(event => event.includes("update"))) {
          setPayments(prev => 
            prev.map(payment => 
              payment.$id === payload.$id ? payload : payment
            )
          )
        }
      })

      unsubscribeTransactions = client.subscribe(transactionsChannel, (response) => {
        const { payload, events } = response
        console.log('🔄 Transaction real-time update:', events)

        if (events.some(event => event.includes("create"))) {
          setTransactions(prev => {
            const exists = prev.some(transaction => transaction.$id === payload.$id)
            if (!exists && (payload.buyerId === user.$id || payload.sellerId === user.$id)) {
              return [payload, ...prev]
            }
            return prev
          })
        }
      })
    } else {
      console.log('👤 User not authenticated, clearing payment data')
      setPayments([])
      setTransactions([])
    }

    return () => {
      if (unsubscribePayments) unsubscribePayments()
      if (unsubscribeTransactions) unsubscribeTransactions()
    }
  }, [user])

  return (
    <PaymentsContext.Provider value={{
      payments,
      transactions,
      loading,
      fetchPayments,
      fetchTransactions,
      getPaymentById,
      getEarnings,
      getSpending,
      getPendingPayments
    }}>
      {children}
    </PaymentsContext.Provider>
  )
}