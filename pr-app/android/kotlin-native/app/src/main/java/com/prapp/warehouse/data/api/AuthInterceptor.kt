package com.prapp.warehouse.data.api

import com.prapp.warehouse.utils.SharedPrefsManager
import okhttp3.Credentials
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(private val prefsManager: SharedPrefsManager) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val username = prefsManager.getUsername()
        val password = prefsManager.getPassword()

        val requestBuilder = originalRequest.newBuilder()
            .header("Accept", "application/json")

        if (username != null && password != null) {
            val credential = Credentials.basic(username, password)
            requestBuilder.header("Authorization", credential)
        }
        
        return chain.proceed(requestBuilder.build())
    }
}
