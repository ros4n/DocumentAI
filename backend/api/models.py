from django.contrib.auth.models import User
from django.db import models


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    full_name = models.CharField(max_length=200, blank=True, default='')
    first_name = models.CharField(max_length=100, blank=True, default='')
    last_name = models.CharField(max_length=100, blank=True, default='')
    email = models.CharField(max_length=200, blank=True, default='')
    phone = models.CharField(max_length=50, blank=True, default='')
    dob = models.CharField(max_length=50, blank=True, default='')
    address = models.CharField(max_length=300, blank=True, default='')
    city = models.CharField(max_length=100, blank=True, default='')
    state = models.CharField(max_length=100, blank=True, default='')
    zip = models.CharField(max_length=20, blank=True, default='')
    country = models.CharField(max_length=100, blank=True, default='')
    employer = models.CharField(max_length=200, blank=True, default='')
    occupation = models.CharField(max_length=200, blank=True, default='')
    gender = models.CharField(max_length=50, blank=True, default='')
    marital_status = models.CharField(max_length=50, blank=True, default='')
    nationality = models.CharField(max_length=100, blank=True, default='')
    id_number = models.CharField(max_length=100, blank=True, default='')
    custom_fields = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.user.username


class ScanRecord(models.Model):
    SCAN_TYPE = (('image', 'Image'), ('pdf', 'PDF'))
    SCAN_SOURCE = (('camera', 'Camera'), ('upload', 'Upload'), ('pdf', 'PDF'))

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='scans')
    created_at = models.DateTimeField(auto_now_add=True)
    name = models.CharField(max_length=200, blank=True, default='')
    scan_type = models.CharField(max_length=10, choices=SCAN_TYPE, default='image')
    source = models.CharField(max_length=10, choices=SCAN_SOURCE, default='camera')
    preview_image = models.TextField(blank=True, default='')
    ocr_text = models.TextField(blank=True, default='')
    ocr_engine = models.CharField(max_length=20, blank=True, default='')
    pages = models.PositiveIntegerField(default=1)
    filled_image = models.TextField(blank=True, default='')
    filled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.username} scan {self.created_at:%Y-%m-%d %H:%M}'
