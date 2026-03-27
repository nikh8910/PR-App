package com.prapp.warehouse.data.api

import android.content.Context
import com.prapp.warehouse.utils.SharedPrefsManager
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ServiceGenerator {
    private const val TIMEOUT_SECONDS = 30L

    fun <S> createService(
        context: Context,
        serviceClass: Class<S>
    ): S {
        val prefsManager = SharedPrefsManager(context)
        val serverUrl = prefsManager.getServerUrl() ?: "https://default.url/"
        
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(prefsManager))
            .addInterceptor(logging)
            .connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .build()

        val gson = com.google.gson.GsonBuilder().setLenient().create()

        val retrofit = Retrofit.Builder()
            .baseUrl(serverUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()

        return retrofit.create(serviceClass)
    }
}
