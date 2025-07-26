import { StyleSheet, Text, useColorScheme, View } from 'react-native'
import React from 'react'
import { Stack } from 'expo-router'
import { StripeProvider } from '@stripe/stripe-react-native'
import { Colors } from "../constants/Colors"
import { StatusBar } from 'expo-status-bar'
import { UserProvider } from '../contexts/UserContext'
import { BooksProvider } from '../contexts/BooksContext'
import { MessagingProvider } from '../contexts/MessagingContext'
import { PaymentsProvider } from '../contexts/PaymentsContext'
import { STRIPE_CONFIG } from '../lib/appwrite'

const RootLayout = () => {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme] ?? Colors.light

  return (
    <StripeProvider publishableKey={STRIPE_CONFIG.PUBLISHABLE_KEY}>
      <UserProvider>
        <BooksProvider>
          <PaymentsProvider>
            <MessagingProvider>
              <StatusBar value= "auto"/>
              <Stack screenOptions={{
                  headerStyle: {backgroundColor: theme.navBackground},
                  headerTintColor: theme.title,
              }}>
                <Stack.Screen name="(auth)" options={{headerShown: false}}/>
                <Stack.Screen name="(dashboard)" options={{headerShown: false}}/>
                <Stack.Screen name="index" options={{title: 'Home', headerShown: false}}/>
              </Stack>
            </MessagingProvider>
          </PaymentsProvider>
        </BooksProvider>
      </UserProvider>
    </StripeProvider>
  )
}

export default RootLayout

const styles = StyleSheet.create({})