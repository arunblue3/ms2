import { useContext } from 'react'
import { PaymentsContext } from '../contexts/PaymentsContext'
import { useState } from 'react'
import { useStripe } from '@stripe/stripe-react-native'
import { useUser } from './useUser'
import { account, STRIPE_CONFIG, handleAppwriteError } from '../lib/appwrite'

export function usePayments() {
  const paymentsContext = useContext(PaymentsContext)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const { user } = useUser()

  const createPaymentIntent = async (serviceId, amount, description) => {
    try {
      if (!user) {
        throw new Error('User must be authenticated to make payments')
      }

      console.log('🔐 Creating payment intent for service:', serviceId)
      
      // Get current session JWT
      const session = await account.getSession('current')
      const jwt = session.providerAccessToken || session.secret

      const response = await fetch(STRIPE_CONFIG.PAYMENT_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          serviceId,
          amount,
          currency: 'sgd',
          description
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create payment intent')
      }

      const data = await response.json()
      console.log('✅ Payment intent created:', data.paymentIntentId)
      
      return data
    } catch (error) {
      console.error('❌ Error creating payment intent:', error)
      const errorInfo = handleAppwriteError(error)
      throw new Error(errorInfo.message)
    }
  }

  const initializePaymentSheet = async (clientSecret, merchantDisplayName = 'Your Service') => {
    try {
      console.log('🔧 Initializing payment sheet...')
      
      const { error } = await initPaymentSheet({
        merchantDisplayName,
        paymentIntentClientSecret: clientSecret,
        defaultBillingDetails: {
          email: user?.email,
        },
        allowsDelayedPaymentMethods: false,
        returnURL: 'your-app://payment-complete',
      })

      if (error) {
        console.error('❌ Payment sheet initialization error:', error)
        throw new Error(error.message)
      }

      console.log('✅ Payment sheet initialized successfully')
      return true
    } catch (error) {
      console.error('❌ Error initializing payment sheet:', error)
      throw error
    }
  }

  const processPayment = async (serviceId, amount, description) => {
    try {
      setLoading(true)
      setError(null)

      console.log('💳 Starting payment process...')
      
      // Step 1: Create payment intent
      const { clientSecret, paymentIntentId, paymentRecordId } = await createPaymentIntent(
        serviceId, 
        amount, 
        description
      )

      // Step 2: Initialize payment sheet
      await initializePaymentSheet(clientSecret)

      // Step 3: Present payment sheet
      console.log('📱 Presenting payment sheet...')
      const { error: paymentError } = await presentPaymentSheet()

      if (paymentError) {
        console.error('❌ Payment error:', paymentError)
        
        if (paymentError.code === 'Canceled') {
          throw new Error('Payment was canceled')
        }
        
        throw new Error(paymentError.message)
      }

      console.log('✅ Payment completed successfully!')
      
      return {
        success: true,
        paymentIntentId,
        paymentRecordId
      }

    } catch (error) {
      console.error('❌ Payment process error:', error)
      setError(error.message)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const clearError = () => {
    setError(null)
  }

  return {
    processPayment,
    loading,
    error,
    clearError,
    ...paymentsContext
  }
}