import { StyleSheet, Text, Alert, View } from 'react-native'
import { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { usePayments } from '../hooks/usePayments'
import { useUser } from '../hooks/useUser'

import ThemedButton from './ThemedButton'
import ThemedText from './ThemedText'

const PaymentButton = ({ service, onPaymentSuccess, onPaymentError, style }) => {
  const [processing, setProcessing] = useState(false)
  const { processPayment, loading, error } = usePayments()
  const { user } = useUser()

  const handlePayment = async () => {
    if (!service || !user) {
      Alert.alert('Error', 'Service or user information not available')
      return
    }

    // Prevent paying for your own service
    if (service.userId === user.$id) {
      Alert.alert('Error', 'You cannot pay for your own service')
      return
    }

    // Calculate payment amount (you can customize this logic)
    const amount = service.hourlyRate || 50 // Default to $50 if no rate specified

    Alert.alert(
      'Confirm Payment',
      `Pay S$${amount} for "${service.title}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Pay Now',
          onPress: async () => {
            try {
              setProcessing(true)
              
              const result = await processPayment(
                service.$id,
                amount,
                `Payment for ${service.title}`
              )

              Alert.alert(
                'Payment Successful!',
                'Your payment has been processed successfully.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      if (onPaymentSuccess) {
                        onPaymentSuccess(result)
                      }
                    }
                  }
                ]
              )

            } catch (error) {
              console.error('Payment failed:', error)
              
              const errorMessage = error.message === 'Payment was canceled' 
                ? 'Payment was canceled' 
                : 'Payment failed. Please try again.'

              Alert.alert('Payment Failed', errorMessage)
              
              if (onPaymentError) {
                onPaymentError(error)
              }
            } finally {
              setProcessing(false)
            }
          }
        }
      ]
    )
  }

  const isDisabled = loading || processing || !service || service.userId === user?.$id

  return (
    <View style={style}>
      <ThemedButton 
        onPress={handlePayment}
        disabled={isDisabled}
        style={[
          styles.paymentButton,
          isDisabled && styles.disabledButton
        ]}
      >
        <View style={styles.buttonContent}>
          {(loading || processing) ? (
            <Ionicons name="hourglass-outline" size={18} color="#fff" />
          ) : (
            <Ionicons name="card-outline" size={18} color="#fff" />
          )}
          <Text style={styles.buttonText}>
            {(loading || processing) ? 'Processing...' : `Pay S$${service?.hourlyRate || 50}`}
          </Text>
        </View>
      </ThemedButton>
      
      {error && (
        <ThemedText style={styles.errorText}>
          {error}
        </ThemedText>
      )}
      
      {service?.userId === user?.$id && (
        <ThemedText style={styles.ownServiceText}>
          This is your own service
        </ThemedText>
      )}
    </View>
  )
}

export default PaymentButton

const styles = StyleSheet.create({
  paymentButton: {
    backgroundColor: '#00D924',
    shadowColor: '#00D924',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 6,
  },
  disabledButton: {
    backgroundColor: '#ccc',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  ownServiceText: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
})