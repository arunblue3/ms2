import { Image, TouchableOpacity, StyleSheet, Text, Alert } from 'react-native'
import { useState, useEffect } from 'react'
import { useUser } from '../../hooks/useUser'
import * as ImagePicker from 'expo-image-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import defaultProfilePic from '../../assets/img/avatar_placeholder.png'

import Spacer from "../../components/Spacer"
import ThemedText from "../../components/ThemedText"
import ThemedView from "../../components/ThemedView"
import ThemedButton from '../../components/ThemedButton'

const Profile = () => {
  const { logout, user } = useUser()
  const [profilePic, setProfilePic] = useState(null)
  const [hasPermission, setHasPermission] = useState(null)
  
  useEffect(() => {
    const loadProfilePicture = async () => {
      try {
        const savedUri = await AsyncStorage.getItem('profilePic')
        if (savedUri !== null) {
          setProfilePic(savedUri)
        }
      } catch (error) {
        console.log('Error loading profile picture:', error)
      }
    }
    
    loadProfilePicture()
  }, [])

  const verifyPermission = async () => {
    if (hasPermission) return true
    
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    setHasPermission(status === 'granted')
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Please allow access to your photo library to upload a profile picture.',
        [{ text: 'OK', onPress: () => console.log('OK Pressed') }]
      )
    }
    return status === 'granted'
  }

  const selectImage = async () => {
    const permissionGranted = await verifyPermission()
    if (!permissionGranted) return
    
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      })
      
      if (!result.canceled) {
        const selectedUri = result.assets[0].uri
        setProfilePic(selectedUri)
        await AsyncStorage.setItem('profilePic', selectedUri)
      }
    } catch (error) {
      console.log('Image picker error:', error)
      Alert.alert('Error', 'Failed to select image')
    }
  }

  return (
    <ThemedView style={styles.container}>
      <TouchableOpacity onPress={selectImage}>
        <Image
          source={profilePic ? { uri: profilePic } : defaultProfilePic}
          style={styles.profilePic}
        />
      </TouchableOpacity>
      <Spacer height={20}/>

      <ThemedText title={true} style={styles.heading}>
        {user.email}
      </ThemedText>
      <Spacer />

      <ThemedText>Time to hunt...</ThemedText>
      <Spacer />

      <ThemedButton onPress={logout} style={styles.button}>
        <Text style={{ color: '#f2f2f2' }}>Logout</Text>
      </ThemedButton>
    </ThemedView>
  )
}

export default Profile

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  heading: {
    fontWeight: "bold",
    fontSize: 18,
    textAlign: "center",
  },
  profilePic: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#ccc',
  },
})