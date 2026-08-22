from django.urls import path

from .views import detect_fields, health, login, me, ocr, profile, register, scan_detail, scans

urlpatterns = [
    path('health/', health, name='health'),
    path('auth/register/', register, name='register'),
    path('auth/login/', login, name='login'),
    path('auth/me/', me, name='me'),
    path('profile/', profile, name='profile'),
    path('scans/', scans, name='scans'),
    path('scans/<int:scan_id>/', scan_detail, name='scan-detail'),
    path('ocr/', ocr, name='ocr'),
    path('documents/detect-fields/', detect_fields, name='detect-fields'),
]
