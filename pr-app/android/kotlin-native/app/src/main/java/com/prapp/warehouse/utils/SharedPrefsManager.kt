package com.prapp.warehouse.utils

import android.content.Context
import android.content.SharedPreferences

class SharedPrefsManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    companion object {
        private const val PREFS_NAME = "prapp_prefs"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_USERNAME = "username"
        private const val KEY_PASSWORD = "password"
        private const val KEY_CLIENT = "client"
    }

    fun saveDetails(serverUrl: String, username: String, password: String, client: String) {
        prefs.edit().apply {
            putString(KEY_SERVER_URL, serverUrl)
            putString(KEY_USERNAME, username)
            putString(KEY_PASSWORD, password)
            putString(KEY_CLIENT, client)
            apply()
        }
    }

    fun getServerUrl(): String? = prefs.getString(KEY_SERVER_URL, null)
    fun getUsername(): String? = prefs.getString(KEY_USERNAME, null)
    fun getPassword(): String? = prefs.getString(KEY_PASSWORD, null)
    fun getClient(): String? = prefs.getString(KEY_CLIENT, null)
    
    fun clear() {
        prefs.edit().clear().apply()
    }
}
